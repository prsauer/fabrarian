// Options page: manage the per-hero main decks. Deck links are resolved through
// fabrary's API using the access token the content script mirrored into
// chrome.storage, so the hero is read from the deck rather than typed by hand.
import { heroIconUrl } from '../config.js';
import { getDeck, setTokenSource, FabApiError } from '../fab-api/client.js';
import {
  deckUrl,
  mainDeckFrom,
  parseDeckRef,
  readMainDecks,
  writeMainDecks,
  onMainDecksChanged,
  type MainDecks,
} from '../main-decks.js';
import { readToken } from '../storage.js';

setTokenSource(async () => (await readToken())?.value ?? null);

const $ = <T extends HTMLElement>(id: string): T => {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
};

const form = $<HTMLFormElement>('add');
const refInput = $<HTMLInputElement>('ref');
const submitBtn = $<HTMLButtonElement>('submit');
const noticeEl = $<HTMLParagraphElement>('notice');
const listEl = $<HTMLUListElement>('list');
const emptyEl = $<HTMLParagraphElement>('empty');

function notice(text: string, kind: 'ok' | 'warn' | 'error' | '' = ''): void {
  noticeEl.textContent = text;
  noticeEl.className = 'notice' + (kind ? ` is-${kind}` : '');
  noticeEl.hidden = !text;
}

function render(decks: MainDecks): void {
  const entries = Object.values(decks).sort((a, b) => a.heroName.localeCompare(b.heroName));
  emptyEl.hidden = entries.length > 0;
  listEl.replaceChildren(
    ...entries.map((m) => {
      const li = document.createElement('li');
      li.className = 'deck';

      const img = document.createElement('img');
      img.alt = '';
      img.src = heroIconUrl(m.heroIdentifier);
      img.addEventListener('error', () => {
        const ph = document.createElement('span');
        ph.className = 'hero-fallback';
        img.replaceWith(ph);
      });

      const text = document.createElement('div');
      text.className = 'text';
      const hero = document.createElement('div');
      hero.className = 'hero';
      hero.textContent = m.heroName;
      const name = document.createElement('div');
      name.className = 'name';
      const link = document.createElement('a');
      link.href = deckUrl(m.deckId);
      link.target = '_blank';
      link.rel = 'noopener';
      link.textContent = m.deckName;
      name.append(link);
      text.append(hero, name);

      const remove = document.createElement('button');
      remove.type = 'button';
      remove.className = 'ghost';
      remove.textContent = 'Remove';
      remove.addEventListener('click', async () => {
        const current = await readMainDecks();
        delete current[m.heroIdentifier];
        await writeMainDecks(current);
        notice(`Removed the main deck for ${m.heroName}.`, 'ok');
        render(current);
      });

      li.append(img, text, remove);
      return li;
    }),
  );
}

function errorText(err: unknown): string {
  if (err instanceof FabApiError && err.kind === 'no-token') {
    return 'No fabrary session captured yet. Open fabrary.net while signed in, then try again.';
  }
  if (err instanceof FabApiError && err.kind === 'unauthorized') {
    return 'Fabrary rejected the saved session. Open fabrary.net to refresh it, then try again.';
  }
  return `Could not load that deck: ${err instanceof Error ? err.message : String(err)}`;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const deckId = parseDeckRef(refInput.value);
  if (!deckId) {
    notice('That does not look like a fabrary deck link or id.', 'error');
    return;
  }
  submitBtn.disabled = true;
  notice('Loading deck…');
  try {
    const deck = await getDeck(deckId);
    const record = mainDeckFrom(deck);
    if (!record) {
      notice('That deck has no hero, so it cannot be a main deck.', 'error');
      return;
    }
    const current = await readMainDecks();
    const previous = current[record.heroIdentifier];
    const replaced = !!previous && previous.deckId !== record.deckId;
    current[record.heroIdentifier] = record;
    await writeMainDecks(current);
    render(current);
    refInput.value = '';
    notice(
      replaced
        ? `${record.heroName}: replaced “${previous.deckName}” with “${record.deckName}”.`
        : `${record.heroName}: main deck set to “${record.deckName}”.`,
      replaced ? 'warn' : 'ok',
    );
  } catch (err) {
    notice(errorText(err), 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

onMainDecksChanged(render);
void readMainDecks().then(render);
