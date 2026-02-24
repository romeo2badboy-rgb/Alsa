/**
 * Animation picker panel.
 *
 * Categorised browser for the BVH animations available from the GitHub
 * asset pack. Selecting an entry fires onSelect(url, name).
 */

const RAW_BASE =
  'https://raw.githubusercontent.com/test157t/VRM-Assets-Pack-For-Silly-Tavern/main/animation/';

const CATEGORIES = [
  {
    id: 'idle', label: '😌 Idle',
    anims: [
      'neutral', 'neutral2', 'neutral3', 'neutral4',
      'neutral_idle', 'neutral_idle2',
      'kneel_idle', 'kneel_idle2',
      'laying_idle', 'laying_idle2', 'laying_idle3',
      'sit_idle', 'sit_idle2', 'sit_idle3', 'sit_idle4',
    ],
  },
  {
    id: 'action', label: '🏃 Actions',
    anims: [
      'action_walk', 'action_run', 'action_jog', 'action_jump',
      'action_greeting', 'action_greeting1', 'action_standup',
      'action_crouch', 'action_laydown', 'action_crawling',
      'action_pat', 'action_pickingup', 'action_gaming',
      'action_attention_seeking',
    ],
  },
  {
    id: 'dance', label: '💃 Dance',
    anims: [
      'dance_1', 'dance_2', 'dance_dab', 'dance_rumba',
      'dance_gangnam_style', 'dance_headdrop',
      'dance_marachinostep', 'dance_northern_soul_spin',
      'dance_ontop', 'dance_pushback', 'dance_backup',
    ],
  },
  {
    id: 'emotion', label: '😊 Emotions',
    anims: [
      'joy', 'joy2', 'joy3',
      'love', 'love2', 'love3',
      'admiration', 'admiration2', 'admiration3',
      'excitement', 'excitement2', 'excitement3',
      'amusement', 'amusement2', 'amusement3',
      'approval', 'approval2', 'approval3',
      'caring', 'caring1',
      'curiosity', 'curiosity2', 'curiosity3',
      'gratitude', 'optimism', 'pride', 'pride2',
      'realization', 'relief', 'relief1',
      'desire', 'desire1', 'desire2',
      'surprise', 'surprise2',
      'anger', 'anger2', 'anger3',
      'annoyance', 'annoyance1',
      'confusion', 'confusion2', 'confusion3',
      'disappointment', 'disappointment2',
      'disapproval', 'disaproval1',
      'disgust', 'disgust1', 'disgust2',
      'embarrassment',
      'fear', 'fear2', 'fear3',
      'grief',
      'nervousness', 'nervousness2', 'nervousnes3',
      'remorse', 'remorse2', 'remorse3',
      'sadness', 'sadness2',
    ],
  },
  {
    id: 'exercise', label: '💪 Exercise',
    anims: [
      'exercise_crunch', 'exercise_crunches',
      'exercise_jogging', 'exercise_jumping_jacks',
    ],
  },
  {
    id: 'reaction', label: '⚡ Reactions',
    anims: [
      'hitarea_head', 'hitarea_chest', 'hitarea_butt',
      'hitarea_foot', 'hitarea_groin', 'hitarea_hands', 'hitarea_leg',
      'reaction_groinhit', 'reaction_headshot',
    ],
  },
];

/** Human-readable label from a raw animation filename. */
function toLabel(name) {
  return name
    .replace(/^(action_|dance_|exercise_|hitarea_|reaction_)/, '')
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export class AnimationPicker {
  /** @param {(url: string, name: string) => void} onSelect */
  constructor(onSelect) {
    this._onSelect  = onSelect;
    this._panel     = null;
    this._visible   = false;
    this._activeCat = 'idle';
    this._build();
  }

  _build() {
    this._panel = document.createElement('div');
    this._panel.id = 'anim-picker-panel';
    this._panel.innerHTML = `
      <div class="picker-header">
        <span>Animations</span>
        <button class="picker-close" aria-label="Close">✕</button>
      </div>
      <div class="anim-tabs">
        ${CATEGORIES.map((c) =>
          `<button class="anim-tab${c.id === this._activeCat ? ' active' : ''}"
                   data-cat="${c.id}">${c.label}</button>`
        ).join('')}
      </div>
      <div class="anim-list" id="anim-list-items"></div>
    `;
    document.body.appendChild(this._panel);

    this._panel.querySelector('.picker-close')
      .addEventListener('click', () => this.hide());

    this._panel.querySelectorAll('.anim-tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        this._panel.querySelectorAll('.anim-tab')
          .forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        this._activeCat = tab.dataset.cat;
        this._renderList();
      });
    });

    this._renderList();
  }

  _renderList() {
    const cat    = CATEGORIES.find((c) => c.id === this._activeCat);
    const listEl = this._panel.querySelector('#anim-list-items');
    if (!cat || !listEl) return;

    listEl.innerHTML = cat.anims.map((name) => {
      const url   = RAW_BASE + name + '.bvh';
      const label = toLabel(name);
      return `<button class="anim-btn" data-url="${url}" data-name="${name}">${label}</button>`;
    }).join('');

    listEl.querySelectorAll('.anim-btn').forEach((btn) => {
      btn.addEventListener('click', () => {
        listEl.querySelectorAll('.anim-btn')
          .forEach((b) => b.classList.remove('selected'));
        btn.classList.add('selected');
        this._onSelect(btn.dataset.url, btn.dataset.name);
      });
    });
  }

  show()   { this._panel.classList.add('open');    this._visible = true;  }
  hide()   { this._panel.classList.remove('open'); this._visible = false; }
  toggle() { this._visible ? this.hide() : this.show(); }
}
