import { createPortal } from 'react-dom'
import { RANK_LABEL, specialsFor } from '@/engine'
import { DIFFICULTY_MODES } from './format'
import { RankGlyph } from './PlayingCard'

const SPECIALS: { value: number; effect: string }[] = [
  { value: 2, effect: 'Wild. Wipes the demand — whoever is next can throw anything.' },
  {
    value: 5,
    effect:
      "The true wild card. Always playable, and it copies whatever the card under it was doing — a 7's low squeeze stays active, for instance. It never copies an 8's skip, though.",
  },
  { value: 7, effect: 'Forces every play after it lower than 7, until someone breaks it with a card under 7.' },
  { value: 8, effect: 'Skips the next player. Stack more 8s to skip further round the table.' },
  { value: 10, effect: 'Burns the whole pile for good, and you go straight again.' },
  {
    value: 14,
    effect: "Beats anything — except it can't break a 7's low squeeze. Outside of that it's always playable.",
  },
]

export function Tutorial({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="tutorial-title">
      <section className="overlay__panel overlay__panel--wide">
        <span className="eyebrow">How to play</span>
        <h2 className="headline" id="tutorial-title">
          Sweep
        </h2>

        <p className="hint">
          Get rid of every card — hand, face-up, and face-down — before anyone else does. The last player still
          holding cards loses.
        </p>

        <p className="hint">
          On your turn, throw a card that beats the pile's demand, or eat the whole pile if you can't or won't. You
          empty your hand first, then your face-up cards, then your face-down cards blind — you can't touch a later
          group until the one before it is gone.
        </p>

        <div>
          <span className="eyebrow">Special cards</span>
          <ol className="specials" aria-label="Special cards">
            {SPECIALS.map(({ value, effect }) => (
              <li key={value} className="specials__item">
                <span className="specials__rank">
                  <RankGlyph value={value} label={RANK_LABEL[value]} />
                </span>
                <span className="specials__effect">{effect}</span>
              </li>
            ))}
          </ol>
        </div>

        <div>
          <span className="eyebrow">Difficulty</span>
          <div className="modes">
            {DIFFICULTY_MODES.map((mode) => (
              <div key={mode.id} className="mode">
                <span className="mode__name">{mode.name}</span>
                <span className="mode__blurb">{mode.blurb}</span>
                <span className="mode__specials">
                  Active: {specialsFor(mode.id).map((v) => RANK_LABEL[v]).join(', ')}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="overlay__actions">
          <button type="button" className="btn btn--go" onClick={onClose}>
            Got it
          </button>
        </div>
      </section>
    </div>,
    document.body,
  )
}
