--[[
Reading Record sync — a KOReader plugin.

Assembles a JSON payload from KOReader's own data and POSTs it to
read.lolwierd.com/ingest (Bearer token). Two data sources, merged by KOReader's
partial-md5 (stable per file):

  • statistics.sqlite3  → per-book totals + every reading session (page_stat_data)
  • each book's .sdr sidecar → progress %, doc_props (isbn/series/language),
                               summary (status/rating/review) and annotations
                               (highlights + notes)

The server upserts by md5 and dedupes sessions/annotations on natural keys, so
re-sending the whole payload is always safe. Trigger from the menu, or
automatically when Wi-Fi connects.

Config lives in <settings>/readsync.lua: { server = "...", token = "..." }.
]]

local DataStorage = require("datastorage")
local DocSettings = require("docsettings")
local InfoMessage = require("ui/widget/infomessage")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local ReadHistory = require("readhistory")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")
local _ = require("gettext")

-- JSON + HTTP are bundled with KOReader.
local rapidjson = require("rapidjson")
local http = require("socket.http")
local https = require("ssl.https")
local ltn12 = require("ltn12")
local socketutil = require("socketutil")
local socket_url = require("socket.url")

local STATS_DB = DataStorage:getSettingsDir() .. "/statistics.sqlite3"
local CONFIG = DataStorage:getSettingsDir() .. "/readsync.lua"
local AUTO_SYNC_INTERVAL = 24 * 60 * 60
local AUTO_RETRY_INTERVAL = 60 * 60

local ReadSync = WidgetContainer:extend({
    name = "readsync",
})

function ReadSync:init()
    self.settings = LuaSettings:open(CONFIG)
    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
    end
end

-- ── Menu ──────────────────────────────────────────────────────────────────

function ReadSync:addToMainMenu(menu_items)
    menu_items.readsync = {
        text = _("Reading Record sync"),
        sub_item_table = {
            {
                text = _("Sync now"),
                keep_menu_open = false,
                callback = function()
                    self:doSync(false)
                end,
            },
            {
                text = _("Set server URL"),
                keep_menu_open = true,
                callback = function()
                    self:editSetting("server", _("Server URL (e.g. https://read-mcp.lolwierd.com)"))
                end,
            },
            {
                text = _("Set token"),
                keep_menu_open = true,
                callback = function()
                    self:editSetting("token", _("Ingest token"))
                end,
            },
            {
                text = _("Auto-sync daily on Wi-Fi"),
                checked_func = function()
                    return self.settings:isTrue("auto_on_network")
                end,
                callback = function()
                    self.settings:toggle("auto_on_network")
                    self.settings:flush()
                end,
            },
        },
    }
end

function ReadSync:editSetting(key, prompt)
    local InputDialog = require("ui/widget/inputdialog")
    local dialog
    dialog = InputDialog:new({
        title = prompt,
        input = self.settings:readSetting(key) or "",
        buttons = {
            {
                { text = _("Cancel"), callback = function() UIManager:close(dialog) end },
                {
                    text = _("Save"),
                    is_enter_default = true,
                    callback = function()
                        local v = dialog:getInputText()
                        if key == "server" then v = v:gsub("/+$", "") end -- trim trailing slash
                        self.settings:saveSetting(key, v)
                        self.settings:flush()
                        UIManager:close(dialog)
                    end,
                },
            },
        },
    })
    UIManager:show(dialog)
    dialog:onShowKeyboard()
end

-- ── Auto-sync ──────────────────────────────────────────────────────────────

function ReadSync:isAutoSyncDue(now)
    now = now or os.time()
    local last_success = tonumber(self.settings:readSetting("auto_last_success")) or 0
    local last_attempt = tonumber(self.settings:readSetting("auto_last_attempt")) or 0
    return now - last_success >= AUTO_SYNC_INTERVAL
        and now - last_attempt >= AUTO_RETRY_INTERVAL
end

function ReadSync:maybeAutoSync(reason)
    if not self.settings:isTrue("auto_on_network") or self.auto_sync_running then
        return
    end
    -- ReaderReady/Resume can fire while offline. Do not wake Wi-Fi or prompt there;
    -- NetworkConnected is the natural trigger once Wi-Fi is actually available.
    if not NetworkMgr:isOnline() then
        return
    end
    local now = os.time()
    if not self:isAutoSyncDue(now) then
        return
    end
    self.settings:saveSetting("auto_last_attempt", now)
    self.settings:flush()
    logger.info("readsync: daily auto-sync due (" .. tostring(reason) .. ")")
    self:doSync(true, true)
end

function ReadSync:onReaderReady()
    UIManager:nextTick(function()
        self:maybeAutoSync("reader_ready")
    end)
end

function ReadSync:onResume()
    UIManager:scheduleIn(2, function()
        self:maybeAutoSync("resume")
    end)
end

function ReadSync:onNetworkConnected()
    UIManager:scheduleIn(2, function()
        self:maybeAutoSync("network_connected")
    end)
end

-- ── Data gathering ──────────────────────────────────────────────────────────

-- Read the statistics DB. Returns books-by-md5 (seeded with totals) and a session list.
function ReadSync:readStats()
    local books, sessions = {}, {}
    local ok_sq3, SQ3 = pcall(require, "lua-ljsqlite3/init")
    if not ok_sq3 then
        logger.warn("readsync: ljsqlite3 unavailable")
        return books, sessions
    end
    local lfs = require("libs/libkoreader-lfs")
    if not lfs.attributes(STATS_DB, "mode") then
        return books, sessions -- statistics never enabled; sidecars still cover the rest
    end
    local ok, err = pcall(function()
        local conn = SQ3.open(STATS_DB, "ro")
        local id_to_md5 = {}
        local brows = conn:exec(
            "SELECT id, md5, title, authors, pages, last_open, total_read_time, total_read_pages FROM book"
        )
        if brows then
            for i = 1, #brows.id do
                local md5 = brows.md5[i]
                if md5 and md5 ~= "" then
                    id_to_md5[brows.id[i]] = md5
                    books[md5] = {
                        md5 = md5,
                        title = brows.title[i],
                        authors = brows.authors[i],
                        pages = tonumber(brows.pages[i]),
                        last_open = tonumber(brows.last_open[i]),
                        total_read_time = tonumber(brows.total_read_time[i]) or 0,
                        total_read_pages = tonumber(brows.total_read_pages[i]) or 0,
                    }
                end
            end
        end
        local prows = conn:exec(
            "SELECT id_book, page, start_time, duration, total_pages FROM page_stat_data"
        )
        if prows then
            for i = 1, #prows.id_book do
                local md5 = id_to_md5[prows.id_book[i]]
                if md5 then
                    sessions[#sessions + 1] = {
                        md5 = md5,
                        page = tonumber(prows.page[i]) or 0,
                        start_time = tonumber(prows.start_time[i]) or 0,
                        duration = tonumber(prows.duration[i]) or 0,
                        total_pages = tonumber(prows.total_pages[i]) or 0,
                    }
                end
            end
        end
        conn:close()
    end)
    if not ok then
        logger.warn("readsync: stats read failed: " .. tostring(err))
    end
    return books, sessions
end

-- pos0/pos1 may be an xpointer string (epub) or a table (pdf). Always return a string
-- so the dedupe key on the server is stable.
local function posToString(p)
    if p == nil then return nil end
    if type(p) == "string" then return p end
    local ok, s = pcall(rapidjson.encode, p)
    return ok and s or tostring(p)
end


-- The server requires a non-empty datetime string. KOReader entries almost always have
-- one; skip the rare entry that doesn't rather than 400 the whole batch.
local function validDatetime(dt)
    return type(dt) == "string" and dt ~= ""
end

-- Flatten one sidecar's annotations (modern `annotations` array; legacy `highlight` map).
local function collectAnnotations(md5, ds, out)
    local anns = ds:readSetting("annotations")
    if type(anns) == "table" and #anns > 0 then
        for _, a in ipairs(anns) do
            if validDatetime(a.datetime) then
                out[#out + 1] = {
                    md5 = md5,
                    datetime = a.datetime,
                    chapter = a.chapter,
                    page = tonumber(a.pageno or a.page),
                    text = a.text,
                    note = a.note,
                    color = a.color,
                    pos0 = posToString(a.pos0),
                    pos1 = posToString(a.pos1),
                }
            end
        end
        return
    end
    -- Legacy: highlight is page -> array of { text/notes, datetime, chapter, pos0, pos1 }.
    local hl = ds:readSetting("highlight")
    if type(hl) == "table" then
        for page, list in pairs(hl) do
            if type(list) == "table" then
                for _, a in ipairs(list) do
                    if validDatetime(a.datetime) then
                        out[#out + 1] = {
                            md5 = md5,
                            datetime = a.datetime,
                            chapter = a.chapter,
                            page = tonumber(a.page or page),
                            text = a.text,
                            note = a.note or a.notes,
                            color = a.color,
                            pos0 = posToString(a.pos0),
                            pos1 = posToString(a.pos1),
                        }
                    end
                end
            end
        end
    end
end

-- Walk read history, opening each sidecar (lightweight metadata .lua, NOT the book
-- document) to enrich books + collect annotations.
function ReadSync:readSidecars(books, annotations)
    for _, item in ipairs(ReadHistory.hist or {}) do
        local file = item.file
        if file and DocSettings:hasSidecarFile(file) then
            local ok, err = pcall(function()
                local ds = DocSettings:open(file)
                local md5 = ds:readSetting("partial_md5_checksum")
                if not md5 or md5 == "" then return end
                local props = ds:readSetting("doc_props") or {}
                local summary = ds:readSetting("summary") or {}
                local stats = ds:readSetting("stats") or {}
                local b = books[md5] or { md5 = md5 }
                b.title = b.title or props.title
                b.authors = b.authors or props.authors
                b.series = props.series
                b.language = props.language
                -- doc_props.identifiers can be a string or a table; only pass a string
                -- (the server extracts the ISBN). A table would violate the schema.
                b.isbn = type(props.identifiers) == "string" and props.identifiers or nil
                b.pages = b.pages or tonumber(props.pages) or tonumber(stats.pages)
                b.percent_finished = tonumber(ds:readSetting("percent_finished")) or b.percent_finished or 0
                b.status = summary.status
                b.rating = tonumber(summary.rating)
                b.review = summary.note
                books[md5] = b
                collectAnnotations(md5, ds, annotations)
            end)
            if not ok then
                logger.warn("readsync: sidecar read failed for " .. tostring(file) .. ": " .. tostring(err))
            end
        end
    end
end

-- ── Sync ──────────────────────────────────────────────────────────────────

-- KOReader's partial md5 is lowercase hex; the server enforces /^[a-f0-9]{6,64}$/.
local function isValidMd5(md5)
    return type(md5) == "string" and md5:match("^%x%x%x%x%x%x+$") ~= nil and #md5 <= 64
end

function ReadSync:buildPayload()
    local books, sessions = self:readStats()
    local annotations = {}
    self:readSidecars(books, annotations)

    -- Only emit books with a title AND a valid md5. Then drop any session/annotation
    -- whose md5 isn't among those books — an orphan would fail the server's FK (or a bad
    -- md5 would 400 the whole batch).
    local book_list, accepted = {}, {}
    for _, b in pairs(books) do
        if b.title and b.title ~= "" and isValidMd5(b.md5) then
            book_list[#book_list + 1] = b
            accepted[b.md5] = true
        end
    end
    local function keep(list)
        local out = {}
        for _, x in ipairs(list) do
            if accepted[x.md5] then out[#out + 1] = x end
        end
        return out
    end

    local Device = require("device")
    return {
        device = Device and Device.model or nil,
        koreader_version = tostring((require("version")):getNormalizedCurrentVersion()),
        generated_at = os.time(),
        books = book_list,
        sessions = keep(sessions),
        annotations = keep(annotations),
    }
end

function ReadSync:doSync(silent)
    local server = self.settings:readSetting("server")
    local token = self.settings:readSetting("token")
    if not server or server == "" or not token or token == "" then
        if not silent then
            UIManager:show(InfoMessage:new({ text = _("Set the server URL and token first.") }))
        end
        return
    end

    local function run()
        local payload = self:buildPayload()
        -- empty_table_as_array: encode empty `sessions`/`annotations` as [] not {} (the
        -- server's Zod schema requires arrays). Top-level + per-item tables have string
        -- keys, so they stay objects.
        local body = rapidjson.encode(payload, { empty_table_as_array = true })
        local url = server .. "/ingest"
        local scheme = socket_url.parse(url).scheme
        local requester = scheme == "https" and https or http

        local resp = {}
        socketutil:set_timeout(20, 60)
        -- NB: don't name the throwaway `_` — that would shadow the gettext `_` for the
        -- rest of this scope and break every later `_("…")` call.
        local _ok, code = requester.request({
            url = url,
            method = "POST",
            headers = {
                ["Content-Type"] = "application/json",
                ["Authorization"] = "Bearer " .. token,
                ["Content-Length"] = tostring(#body),
            },
            source = ltn12.source.string(body),
            sink = ltn12.sink.table(resp),
        })
        socketutil:reset_timeout()

        local summary = string.format(
            "%d books · %d sessions · %d highlights",
            #payload.books, #payload.sessions, #payload.annotations
        )
        if code == 200 or code == 201 then
            logger.info("readsync: ok — " .. summary)
            if not silent then
                UIManager:show(InfoMessage:new({ text = _("Synced: ") .. summary }))
            end
        else
            logger.warn("readsync: failed code=" .. tostring(code) .. " body=" .. table.concat(resp))
            if not silent then
                UIManager:show(InfoMessage:new({
                    text = _("Sync failed (") .. tostring(code) .. _("). See log."),
                }))
            end
        end
    end

    -- Ensure Wi-Fi, then run (KOReader will prompt/connect as needed).
    NetworkMgr:runWhenOnline(function()
        local ok, err = pcall(run)
        if not ok then
            logger.warn("readsync: sync error: " .. tostring(err))
            if not silent then
                UIManager:show(InfoMessage:new({ text = _("Sync error. See log.") }))
            end
        end
    end)
end

return ReadSync
