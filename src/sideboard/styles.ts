// Styles for the sideboard panel, injected once as a <style> tag. All selectors
// are scoped under `fab-sb-` so nothing leaks into fabrary's own UI.
export const SIDEBOARD_STYLE_ID = 'fabrarian-sideboard-styles';

export const SIDEBOARD_CSS = `
.fab-sb-panel { color: #e8e8ea; font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif; padding: 8px 4px 40px; }
.fab-sb-panel * { box-sizing: border-box; }

.fab-sb-bar {
  position: sticky; top: 0; z-index: 5;
  display: flex; flex-wrap: wrap; align-items: center; gap: 10px 14px;
  padding: 10px 12px; margin-bottom: 12px;
  background: #17181c; border: 1px solid #2c2e36; border-radius: 10px;
}
.fab-sb-matchups { display: flex; flex-wrap: wrap; gap: 6px; flex: 1 1 auto; }
.fab-sb-pill {
  display: inline-flex; align-items: center; gap: 6px;
  padding: 3px 10px 3px 4px; border-radius: 999px; cursor: pointer; white-space: nowrap;
  background: #24262e; border: 1px solid #33353f; color: #c9cad1; font-weight: 600; font-size: 12px;
}
.fab-sb-pill.is-base { padding-left: 9px; }
.fab-sb-base-icon { width: 14px; height: 14px; flex: 0 0 auto; opacity: .85; }
.fab-sb-pill:hover { background: #2d303a; }
.fab-sb-pill.is-active { background: #b31217; border-color: #d1181e; color: #fff; }
.fab-sb-hero {
  width: 20px; height: 20px; border-radius: 50%; object-fit: cover;
  background: #0006; border: 1px solid #0006; flex: 0 0 auto;
}

/* Hero matchup: icon-only circular portrait, like fabrary's Add-matchups modal. */
.fab-sb-pill-hero { padding: 2px; gap: 0; border-radius: 999px; background: transparent; border: 2px solid #3a3c45; }
.fab-sb-pill-hero:hover { background: transparent; border-color: #565964; }
.fab-sb-pill-hero.is-active { background: transparent; border-color: #e6403a; box-shadow: 0 0 0 2px #e6403a66; }
.fab-sb-pill-hero .fab-sb-hero { width: 32px; height: 32px; border: 0; }
.fab-sb-pill-hero .fab-sb-pill-label { display: none; }
/* Extra matchup text beyond the hero's name, small and white beside the portrait. */
.fab-sb-pill-hero .fab-sb-pill-extra {
  margin: 0 6px 0 5px; max-width: 120px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
  font-size: 10px; font-weight: 600; color: #fff; text-shadow: 0 1px 1px #000;
}
.fab-sb-pill:not(.fab-sb-pill-hero) .fab-sb-pill-extra { display: none; } /* text pill shows the full name */
/* In-deck card count for the matchup, overlaid on the portrait's lower edge. */
.fab-sb-pill-hero { position: relative; }
.fab-sb-pill-count {
  position: absolute; left: 50%; bottom: -1px; transform: translateX(-50%);
}
.fab-sb-pill-hero:has(.fab-sb-pill-extra) .fab-sb-pill-count { left: 18px; }
.fab-sb-pill-hero.is-multi:has(.fab-sb-pill-extra) .fab-sb-pill-count { left: 20px; }
.fab-sb-pill-count {
  padding: 0 4px; border-radius: 999px; line-height: 12px;
  font-size: 9px; font-weight: 800; letter-spacing: .02em; font-variant-numeric: tabular-nums;
  color: #fff; background: #000c; text-shadow: 0 1px 1px #000; pointer-events: none;
}
/* Text pills (archetype matchups, or a hero whose icon failed) keep the count
   inline after the label as a small white chip instead of an overlay. */
.fab-sb-pill:not(.fab-sb-pill-hero) .fab-sb-pill-count {
  position: static; transform: none; margin-left: 2px; line-height: 14px; font-size: 10px;
  background: #0006; text-shadow: none;
}
.fab-sb-pill.is-active:not(.fab-sb-pill-hero) .fab-sb-pill-count { background: #0004; }
/* Several heroes in one matchup: portraits overlap into a single stadium so the
   group reads as one selectable unit; the outline ring encloses all of them. */
.fab-sb-pill-hero.is-multi { padding: 2px 4px; }
.fab-sb-pill-hero.is-multi .fab-sb-hero { box-shadow: 0 0 0 2px #17181c; transition: transform .12s; }
.fab-sb-pill-hero.is-multi .fab-sb-hero + .fab-sb-hero { margin-left: -10px; }
.fab-sb-pill-hero.is-multi .fab-sb-hero:hover { transform: scale(1.15); z-index: 1; position: relative; }
.fab-sb-pill-hero.is-multi.is-active .fab-sb-hero { box-shadow: 0 0 0 2px #17181c, 0 0 0 3px #e6403a88; }

.fab-sb-counts { display: flex; gap: 12px; align-items: center; font-variant-numeric: tabular-nums; }
.fab-sb-counts b { color: #fff; }
.fab-sb-legal { color: #3fbf6f; } .fab-sb-illegal { color: #e0a53a; }
/* Second row of the bar: pitch colours and card-type breakdown of the in-deck cards. */
.fab-sb-stats {
  flex: 1 0 100%; display: flex; flex-wrap: wrap; gap: 6px 0; align-items: center;
  padding-top: 8px; border-top: 1px solid #26272e; font-size: 12px; color: #9a9ca6;
  font-variant-numeric: tabular-nums;
}
.fab-sb-stat-group { display: inline-flex; flex-wrap: wrap; gap: 4px 12px; align-items: center; }
/* Subtle hairline between groups (colours | card types | block | barrier | hero). */
.fab-sb-stat-group { padding-right: 18px; }
.fab-sb-stat-group + .fab-sb-stat-group { padding-left: 18px; border-left: 1px solid #2c2e36; }
.fab-sb-stat-group:last-child { padding-right: 0; }
.fab-sb-stat { display: inline-flex; align-items: center; gap: 4px; white-space: nowrap; }
/* Hero-conditional stats: tinted so they read as "special for this hero". */
.fab-sb-stat-group.is-hero .fab-sb-stat { color: #d9a441; }
.fab-sb-stat-group.is-hero .fab-sb-stat b { color: #ffd77a; }
.fab-sb-stat b { color: #fff; font-weight: 700; }
.fab-sb-stat.is-sub { color: #6b6d77; margin-left: -6px; }
.fab-sb-stat.is-sub b { color: #c9cad1; }
.fab-sb-stat.is-sub::before { content: '('; } .fab-sb-stat.is-sub::after { content: ')'; }
.fab-sb-pitch { gap: 5px; }
.fab-sb-pip { display: inline-block; width: 10px; height: 10px; border-radius: 50%; border: 1px solid #0008; }
.fab-sb-pitch.is-red .fab-sb-pip { background: #d2302c; }
.fab-sb-pitch.is-yellow .fab-sb-pip { background: #e6b800; }
.fab-sb-pitch.is-blue .fab-sb-pip { background: #2f6fd6; }
/* Fixed box so the save indicator can't shift the bar when text appears. */
.fab-sb-status { flex: 0 0 auto; width: 84px; min-height: 1.2em; text-align: right; font-size: 12px; color: #8a8c96; }
.fab-sb-status.is-saving { color: #e0a53a; } .fab-sb-status.is-saved { color: #3fbf6f; } .fab-sb-status.is-error { color: #e0483a; }

.fab-sb-grid {
  display: grid; grid-template-columns: repeat(auto-fill, 112px); gap: 10px; justify-content: start;
}
.fab-sb-section-title {
  margin: 12px 2px 8px; padding-top: 8px;
  border-top: 1px solid #26272e; color: #9a9ca6; font-weight: 700; font-size: 12px; text-transform: uppercase; letter-spacing: .04em;
}
.fab-sb-section-title span { color: #6b6d77; font-weight: 600; text-transform: none; letter-spacing: 0; }

/* Equipment slots packed horizontally, each a labelled cluster that wraps. */
.fab-sb-equip { display: flex; flex-wrap: wrap; gap: 12px 20px; margin-bottom: 6px; }
.fab-sb-slot-title { color: #9a9ca6; font-weight: 700; font-size: 11px; text-transform: uppercase; letter-spacing: .04em; margin: 0 2px 6px; }
.fab-sb-slot-tiles { display: flex; flex-wrap: wrap; gap: 8px; }
.fab-sb-slot-tiles .fab-sb-tile { width: 112px; }

/* One tile per copy. Included copies get a thin gold border; excluded copies are
   gently dimmed (opacity, not opaqueness) to signal they're in the sideboard. */
.fab-sb-tile {
  position: relative; border-radius: 8px; overflow: hidden; background: #101114; cursor: pointer;
  border: 2px solid #34363f;
  transition: opacity .12s, filter .12s, border-color .12s, box-shadow .12s, transform .06s;
}
.fab-sb-tile:not(.is-out) { border-color: #e6b800; }
.fab-sb-tile:not(.is-out):hover { box-shadow: 0 0 0 2px #ffd42088; }
.fab-sb-tile.is-out { opacity: .72; filter: grayscale(.3); }
.fab-sb-tile.is-out:hover { opacity: .9; }
.fab-sb-tile:active { transform: scale(.98); }

/* "Stub" art: the top 0.585 of the card (art) over the bottom 0.128 (type text),
   with the middle text box cropped out. Card art is 546x762 (H/W = 1.3956), so the
   crop heights become 0.585*1.3956 and 0.128*1.3956 of the tile width. */
.fab-sb-art { display: flex; flex-direction: column; width: 100%; background: #17181c; pointer-events: none; }
.fab-sb-crop { width: 100%; background-repeat: no-repeat; background-size: 100% auto; background-color: #17181c; }
.fab-sb-crop-top { aspect-ratio: 1 / 0.8164; background-position: 50% 0%; }
.fab-sb-crop-bottom { aspect-ratio: 1 / 0.1786; background-position: 50% 100%; }

.fab-sb-tag { position: absolute; bottom: 5px; right: 5px; padding: 1px 6px; border-radius: 999px;
  font-size: 10px; font-weight: 800; letter-spacing: .04em; color: #fff; background: #000a; pointer-events: none; }
.fab-sb-tile.is-out .fab-sb-tag { background: #4b4d57cc; }
.fab-sb-tile:not(.is-out) .fab-sb-tag { display: none; }

/* Floating full-card hover preview (uncropped). */
.fab-sb-preview {
  position: fixed; z-index: 2147483000; pointer-events: none;
  border-radius: 14px; overflow: hidden; box-shadow: 0 14px 44px #000d, 0 0 0 1px #0008;
  opacity: 0; transform: scale(.98); transition: opacity .09s ease, transform .09s ease;
}
.fab-sb-preview.is-visible { opacity: 1; transform: scale(1); }
.fab-sb-preview img { display: block; width: 100%; height: auto; }

.fab-sb-msg { padding: 24px 12px; color: #9a9ca6; }
.fab-sb-msg.is-error { color: #e0776a; }
.fab-sb-retry { margin-left: 8px; padding: 3px 10px; border-radius: 6px; border: 1px solid #40424c;
  background: #24262e; color: #e8e8ea; cursor: pointer; }
`;

export function ensureStyles(): void {
  if (document.getElementById(SIDEBOARD_STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = SIDEBOARD_STYLE_ID;
  style.textContent = SIDEBOARD_CSS;
  document.head.appendChild(style);
}
