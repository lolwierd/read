<script lang="ts">
  import { onMount } from "svelte";
  import type { PageData } from "./$types";

  let { data }: { data: PageData } = $props();
  const p = $derived(data.page);

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
  function searchCover(el: HTMLElement, title: string, author: string): void {
    fetch(`https://openlibrary.org/search.json?title=${encodeURIComponent(title)}&author=${encodeURIComponent(author)}&fields=cover_i&limit=1`)
      .then((r) => r.json() as Promise<{ docs?: Array<{ cover_i?: number }> }>)
      .then((d) => {
        const id = d.docs?.[0]?.cover_i;
        if (id) paint(el, `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`);
      })
      .catch(() => {});
  }
  onMount(() => {
    const el = document.querySelector<HTMLElement>(".cover[data-title]");
    if (!el) return;
    const cover = el.dataset.cover;
    const title = el.dataset.title ?? "";
    const author = el.dataset.author ?? "";
    if (cover) paint(el, cover, () => searchCover(el, title, author));
    else searchCover(el, title, author);
  });

  function fmtDate(epoch: number): string {
    if (!epoch) return "";
    return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(epoch * 1000));
  }
</script>

<svelte:head><title>{p.book.title} · The Reading Record</title></svelte:head>

<div class="sheet">
  <header class="mast">
    <div class="topline"><span><a class="back" href="/">‹ The Reading Record</a></span><span></span><span>Kept privately</span></div>
    <div class="dbl"><h1 style="font-size:clamp(28px,6vw,64px)">{p.book.title}</h1></div>
    <div class="sub">
      <span>{p.book.author ?? "Unknown"}</span>
      {#if p.book.series}<span class="dot"></span><span>{p.book.series}</span>{/if}
    </div>
  </header>

  <section class="lead">
    <div
      class="cover"
      style="background:{p.book.coverFallback}"
      data-cover={p.book.coverUrl ?? ""}
      data-title={p.book.title}
      data-author={p.book.author ?? ""}
    >
      <div class="top">{p.book.statusLabel}</div>
      <div><div class="ttl">{p.book.title}</div>{#if p.book.author}<div class="auth">{p.book.author}</div>{/if}</div>
    </div>
    <div class="lead-body">
      <div class="kicker">The volume</div>
      <div class="dateline">
        <div class="fig"><div class="v accent">{p.book.percent}<small>%</small></div><div class="l">Progress</div></div>
        <div class="fig"><div class="v">{p.book.hoursInBook}<small>h</small></div><div class="l">Time read</div></div>
        <div class="fig"><div class="v">{p.highlights.length}</div><div class="l">Highlights</div></div>
        {#if p.rating}<div class="fig"><div class="v">{p.rating}<small>/5</small></div><div class="l">Rating</div></div>{/if}
      </div>
      {#if p.review}<p class="by" style="margin-top:20px">{p.review}</p>{/if}
    </div>
  </section>

  <section class="sec detail rv in">
    <div class="sec-h"><span class="kicker">Highlights &amp; Notes</span><span class="line"></span><span class="meta">{p.highlights.length} kept</span></div>
    {#if p.highlights.length === 0}
      <p class="resume">No highlights kept for this book.</p>
    {/if}
    {#each p.highlights as h, i (h.datetimeEpoch + i)}
      <div class="hl">
        {#if h.text}<div class="q">{h.text}</div>{/if}
        {#if h.note}<div class="note">{h.note}</div>{/if}
        <div class="s">{h.chapter ? `${h.chapter}` : ""}{h.page ? ` · p.${h.page}` : ""}{h.datetimeEpoch ? ` · ${fmtDate(h.datetimeEpoch)}` : ""}</div>
      </div>
    {/each}
  </section>

  <footer class="colophon">
    <span><a class="back" href="/">‹ Back to the Record</a></span>
    <span>Drawn from KOReader</span>
  </footer>
</div>
