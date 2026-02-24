/**
 * Character model picker panel.
 *
 * Shows a slide-in panel listing all VRM characters available from the
 * GitHub asset pack. Selecting one fires onSelect(url, name).
 */

const RAW_BASE =
  'https://raw.githubusercontent.com/test157t/VRM-Assets-Pack-For-Silly-Tavern/main/model/';

export const VRM_MODELS = [
  { name: 'Aera',           file: 'Aera.vrm',           emoji: '🌟' },
  { name: 'Dhahlia',        file: 'Dhahlia.vrm',         emoji: '🌸' },
  { name: 'Epithet',        file: 'Epithet.vrm',         emoji: '⚡' },
  { name: 'Lara Lightland', file: 'Lara Lightland.vrm',  emoji: '💫' },
  { name: 'Onyx',           file: 'Onyx.vrm',            emoji: '🖤' },
  { name: 'Velara',         file: 'Velara.vrm',          emoji: '🔮' },
];

export class ModelPicker {
  /** @param {(url: string, name: string) => void} onSelect */
  constructor(onSelect) {
    this._onSelect = onSelect;
    this._panel    = null;
    this._visible  = false;
    this._build();
  }

  _build() {
    this._panel = document.createElement('div');
    this._panel.id = 'model-picker-panel';
    this._panel.innerHTML = `
      <div class="picker-header">
        <span>Characters</span>
        <button class="picker-close" aria-label="Close">✕</button>
      </div>
      <div class="picker-body">
        ${VRM_MODELS.map((m) => {
          const url = RAW_BASE + encodeURIComponent(m.file);
          return `
            <button class="model-card" data-url="${url}" data-name="${m.name}">
              <span class="model-emoji">${m.emoji}</span>
              <span class="model-name">${m.name}</span>
            </button>`;
        }).join('')}
      </div>
    `;
    document.body.appendChild(this._panel);

    this._panel.querySelector('.picker-close')
      .addEventListener('click', () => this.hide());

    this._panel.querySelectorAll('.model-card').forEach((btn) => {
      btn.addEventListener('click', () => {
        this._panel.querySelectorAll('.model-card')
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
