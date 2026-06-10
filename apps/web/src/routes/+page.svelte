<script lang="ts">
  import { onMount } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const v = $derived(data.view);

  // Resolve real cover art from Open Library (by ISBN, else title+author), keeping the
  // coloured clothbound spine as a graceful fallback — same approach as the mockup.
  // Try a cover URL; on success paint it, on miss/404 run `onFail` (or keep the spine).
  function paint(el: HTMLElement, url: string, onFail?: () => void): void {
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth > 2) {
        el.style.backgroundImage = `url("${url}")`;
        el.classList.add("hascover");
      } else onFail?.();
    };
    img.onerror = () => onFail?.();
    img.src = url;
  }
  async function searchCover(el: HTMLElement, title: string, author: string): Promise<void> {
    try {
      const u = `https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&fields=cover_i&limit=1`;
      const d = (await (await fetch(u)).json()) as { docs?: Array<{ cover_i?: number }> };
      const id = d.docs?.[0]?.cover_i;
      if (id) paint(el, `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`);
    } catch {
      /* keep the coloured fallback */
    }
  }
  function loadCover(el: HTMLElement): void {
    const cover = el.dataset.cover; // R2 embedded cover, else Open-Library-by-ISBN, else ""
    const title = el.dataset.title ?? "";
    const author = el.dataset.author ?? "";
    // Best known URL first; if it 404s (no R2 cover / OL lacks the edition), fall back to
    // a title+author search, then to the coloured spine.
    if (cover) paint(el, cover, () => searchCover(el, title, author));
    else void searchCover(el, title, author);
  }

  const countUp = (el: HTMLElement, to: number, dur: number): void => {
    const start = performance.now();
    const step = (n: number): void => {
      const p = Math.min(1, (n - start) / dur);
      const e = 1 - Math.pow(1 - p, 3);
      el.textContent = String(Math.round(to * e));
      if (p < 1) requestAnimationFrame(step);
      else el.textContent = String(to);
    };
    requestAnimationFrame(step);
  };

  let pullIdx = $state(0);

  onMount(() => {
    if (!v) return;
    document.querySelectorAll<HTMLElement>(".cv[data-title], .cover[data-title]").forEach(loadCover);

    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const el = e.target as HTMLElement;
          el.classList.add("in");
          if (el.classList.contains("lead")) {
            const stats = v.stats;
            const m = el.querySelector<HTMLElement>("#minToday");
            const s = el.querySelector<HTMLElement>("#streak");
            const h = el.querySelector<HTMLElement>("#hrs");
            const p = el.querySelector<HTMLElement>("#pace");
            const bar = el.querySelector<HTMLElement>("#bookbar");
            if (m) countUp(m, stats.minutesToday, 1400);
            if (s) countUp(s, stats.streakDays, 1000);
            if (h && v.now) countUp(h, Math.round(v.now.hoursInBook), 1000);
            if (p) countUp(p, stats.booksThisYear, 1200);
            if (bar && v.now) bar.style.width = `${v.now.percent}%`;
          }
          if (el.querySelector("#week")) {
            el.querySelectorAll<HTMLElement>(".week .bar").forEach((b) => {
              b.style.height = `${b.dataset.h}%`;
            });
            el.querySelectorAll<HTMLElement>(".week .v").forEach((x) => (x.style.opacity = "1"));
          }
          io.unobserve(el);
        }
      },
      { threshold: 0.2 },
    );
    document.querySelectorAll(".rv").forEach((el) => io.observe(el));

    let timer: ReturnType<typeof setInterval> | undefined;
    if (v.pullQuotes.length > 1) {
      timer = setInterval(() => {
        pullIdx = (pullIdx + 1) % v.pullQuotes.length;
      }, 8000);
    }
    return () => {
      io.disconnect();
      if (timer) clearInterval(timer);
    };
  });

  const maxWeek = $derived(v ? Math.max(1, ...v.stats.week.map((d) => d.minutes)) : 1);
  const quote = $derived(v && v.pullQuotes.length > 0 ? v.pullQuotes[pullIdx % v.pullQuotes.length] : null);
  function fmtDate(epoch: number): string {
    if (!epoch) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" }).format(new Date(epoch * 1000));
  }
</script>

<div class="sheet">
  <header class="mast">
    <div class="topline">
      <span>Vol. I · No. {data.issue}</span>
      <span>{data.dateLabel}</span>
      <span>Kept privately</span>
    </div>
    <div class="dbl"><h1>The Reading Record</h1></div>
    <div class="sub">
      <span>{v && v.now ? "Currently reading" : "Between books"}</span>
      <span class="dot"></span>
      <span>{v ? v.stats.linesKept : 0} lines kept</span>
      <span class="dot"></span>
      <span>{v ? v.stats.streakDays : 0}-day streak</span>
    </div>
  </header>

  {#if v && v.now}
    {@const now = v.now}
    <section class="lead rv">
      <div
        class="cover"
        style="background:{now.coverFallback}"
        data-cover={now.coverUrl ?? ""}
        data-title={now.title}
        data-author={now.author ?? ""}
      >
        <div class="top">Now Reading</div>
        <div>
          <div class="ttl">{now.title}</div>
          {#if now.author}<div class="auth">{now.author}</div>{/if}
        </div>
      </div>
      <div class="lead-body">
        <div class="kicker">The book in hand</div>
        <h2>{now.title}</h2>
        <div class="by">
          {now.author ?? "Unknown"}{now.series ? ` · ${now.series}` : ""}
        </div>
        <div class="dateline">
          <div class="fig"><div class="v accent"><span id="minToday">0</span><small> min</small></div><div class="l">Read today</div></div>
          <div class="fig"><div class="v"><span id="streak">0</span><small> days</small></div><div class="l">Current streak</div></div>
          <div class="fig"><div class="v"><span id="hrs">0</span><small>h</small></div><div class="l">In this book</div></div>
          <div class="fig"><div class="v"><span id="pace">0</span><small>/40</small></div><div class="l">Books, {data.dateLabel.slice(-4)}</div></div>
        </div>
        <div class="progress-line">
          <span class="resume">
            {#if now.currentChapter}stopped in <b>{now.currentChapter}</b>{:else}{now.percent}% through{/if}
          </span>
          <div class="track"><i id="bookbar"></i></div>
          <span class="pct">{now.percent}%</span>
        </div>
      </div>
    </section>
  {/if}

  {#if quote}
    <section class="pull rv">
      <div class="mark">&ldquo;</div>
      <blockquote>{quote.text}</blockquote>
      <cite>Resurfaced from <b>{quote.bookTitle}</b>{quote.chapter ? ` · ${quote.chapter}` : ""}</cite>
    </section>
  {/if}

  {#if v}
    <div class="two">
      <section class="sec rv" style="padding-top:var(--gap)">
        <div class="sec-h"><span class="kicker">The Week</span><span class="line"></span><span class="meta">minutes per day</span></div>
        <div class="week" id="week">
          {#each v.stats.week as d (d.day)}
            <div class="day">
              <div class="v">{d.minutes || ""}</div>
              <div class="bar {d.today ? 'today' : d.minutes ? 'lit' : ''}" data-h={Math.round((d.minutes / maxWeek) * 100)}></div>
              <div class="d">{d.label}</div>
            </div>
          {/each}
        </div>
        <div class="week-foot">
          <span>This week · <b>{v.stats.weekMinutes}</b> min</span>
          {#if v.stats.bestDay}
            <span class="accent">Best day · <b>{v.stats.bestDay.label} {v.stats.bestDay.minutes}</b></span>
          {/if}
        </div>
      </section>

      <div class="divider"></div>

      <section class="sec marg rv" style="padding-top:var(--gap)">
        <div class="sec-h"><span class="kicker">From the Margins</span><span class="line"></span><span class="meta">recently kept</span></div>
        {#if v.margins.length === 0}
          <p class="resume">No highlights kept yet.</p>
        {/if}
        {#each v.margins as h, i (h.datetimeEpoch + i)}
          <div class="item">
            <div class="n">{h.page ?? i + 1}</div>
            <div>
              <div class="q">{h.text}</div>
              <div class="s"><b>{h.bookTitle}</b>{h.page ? ` · p.${h.page}` : ""}{h.datetimeEpoch ? ` · ${fmtDate(h.datetimeEpoch)}` : ""}</div>
            </div>
          </div>
        {/each}
      </section>
    </div>

    <section class="sec rv">
      <div class="sec-h"><span class="kicker">The Shelf</span><span class="line"></span><span class="meta">tap a volume for its own page</span></div>
      {#if v.shelf.length === 0}
        <div class="empty">
          <div class="kicker">Nothing on the shelf yet</div>
          <p>Sync your Kobo and your books, progress and highlights will appear here.</p>
        </div>
      {:else}
        <div class="shelf">
          {#each v.shelf as b (b.md5)}
            <div class="vol">
              <a
                class="cv"
                href={`/book/${b.md5}`}
                style="background:{b.coverFallback}"
                data-cover={b.coverUrl ?? ""}
                data-title={b.title}
                data-author={b.author ?? ""}
              >
                {#if b.author}<div class="a">{b.author}</div>{/if}
                <div class="t">{b.title}</div>
              </a>
              <div class="meta">
                <span class="st {b.status === 'reading' ? 'now' : ''}">{b.statusLabel}</span>
                <span class="pg">{b.status === "finished" ? "★" : b.percent > 0 ? `${b.percent}%` : "—"}</span>
              </div>
            </div>
          {/each}
        </div>
      {/if}
    </section>
  {:else}
    <div class="empty">
      <div class="kicker">No database connected</div>
      <p>The reading record is waiting for its first sync from the Kobo.</p>
    </div>
  {/if}

  <footer class="colophon">
    <span>The Reading Record · kept privately</span>
    <span>Set in Instrument Serif &amp; Hanken Grotesk · drawn from KOReader</span>
  </footer>
</div>
