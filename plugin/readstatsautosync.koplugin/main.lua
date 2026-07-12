local DataStorage = require("datastorage")
local Event = require("ui/event")
local InfoMessage = require("ui/widget/infomessage")
local LuaSettings = require("luasettings")
local NetworkMgr = require("ui/network/manager")
local UIManager = require("ui/uimanager")
local WidgetContainer = require("ui/widget/container/widgetcontainer")
local logger = require("logger")
local _ = require("gettext")

local CONFIG = DataStorage:getSettingsDir() .. "/readstatsautosync.lua"
local DEFAULT_INTERVAL_SECONDS = 24 * 60 * 60
local RETRY_INTERVAL_SECONDS = 60 * 60

local ReadStatsAutoSync = WidgetContainer:extend({
    name = "readstatsautosync",
    is_doc_only = false,
})

function ReadStatsAutoSync:init()
    self.settings = LuaSettings:open(CONFIG)
    if not self.settings:has("enabled") then
        self.settings:saveSetting("enabled", true)
        self.settings:flush()
    end
    if self.ui and self.ui.menu then
        self.ui.menu:registerToMainMenu(self)
    end
end

function ReadStatsAutoSync:addToMainMenu(menu_items)
    menu_items.readstatsautosync = {
        text = _("Reading statistics auto-sync"),
        sorting_hint = "more_tools",
        sub_item_table = {
            {
                text = _("Enabled"),
                checked_func = function()
                    return self.settings:isTrue("enabled")
                end,
                callback = function()
                    self.settings:toggle("enabled")
                    self.settings:flush()
                end,
            },
            {
                text = _("Sync now"),
                keep_menu_open = false,
                callback = function()
                    self:triggerSync("manual", true)
                end,
            },
            {
                text = _("Reset daily timer"),
                keep_menu_open = false,
                callback = function()
                    self.settings:saveSetting("last_triggered", 0)
                    self.settings:saveSetting("last_attempt", 0)
                    self.settings:flush()
                    UIManager:show(InfoMessage:new({
                        text = _("Reading statistics auto-sync timer reset."),
                        timeout = 2,
                    }))
                end,
            },
        },
    }
end

function ReadStatsAutoSync:statisticsSyncConfigured()
    local stats = G_reader_settings:readSetting("statistics") or {}
    return stats.is_enabled ~= false and stats.sync_server ~= nil
end

function ReadStatsAutoSync:isDue(now)
    now = now or os.time()
    local last_triggered = tonumber(self.settings:readSetting("last_triggered")) or 0
    local last_attempt = tonumber(self.settings:readSetting("last_attempt")) or 0
    return now - last_triggered >= DEFAULT_INTERVAL_SECONDS
        and now - last_attempt >= RETRY_INTERVAL_SECONDS
end

function ReadStatsAutoSync:triggerSync(reason, manual)
    if not manual and not self.settings:isTrue("enabled") then
        return
    end
    if not self:statisticsSyncConfigured() then
        if manual then
            UIManager:show(InfoMessage:new({
                text = _("Reading statistics cloud sync is not configured."),
                timeout = 3,
            }))
        end
        return
    end
    if not NetworkMgr:isOnline() then
        if manual then
            UIManager:show(InfoMessage:new({
                text = _("Connecting Wi-Fi before sync..."),
                timeout = 2,
            }))
            NetworkMgr:runWhenOnline(function()
                self:triggerSync(reason, true)
            end)
        end
        return
    end

    if not manual then
        local now = os.time()
        self.settings:saveSetting("last_attempt", now)
        self.settings:saveSetting("last_triggered", now)
        self.settings:flush()
    end

    -- Reading history is append-only for this single-device ledger. KOReader's cached
    -- three-way merge treats metadata edits (title/author) as book deletion because its
    -- stock identity includes mutable fields. Dropping the last-agreed cache makes this
    -- sync a union merge, so changing metadata cannot erase the old page rows.
    os.remove(DataStorage:getSettingsDir() .. "/statistics.sqlite3.sync")
    logger.info("readstatsautosync: triggering SyncBookStats (" .. tostring(reason) .. ")")
    UIManager:broadcastEvent(Event:new("SyncBookStats"))
end

function ReadStatsAutoSync:maybeSync(reason)
    if self:isDue(os.time()) then
        self:triggerSync(reason, false)
    end
end

function ReadStatsAutoSync:onReaderReady()
    UIManager:scheduleIn(2, function()
        self:maybeSync("reader_ready")
    end)
end

function ReadStatsAutoSync:onResume()
    UIManager:scheduleIn(2, function()
        self:maybeSync("resume")
    end)
end

function ReadStatsAutoSync:onNetworkConnected()
    UIManager:scheduleIn(2, function()
        self:maybeSync("network_connected")
    end)
end

return ReadStatsAutoSync
