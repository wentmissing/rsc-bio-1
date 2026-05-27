class CardGenerator {
    constructor() {
        this.init();
    }

    async init() {

        await window.configLoader.load();

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.generateAllCards());
        } else {
            this.generateAllCards();
        }
    }

    generateAllCards() {
        const config = window.configLoader;

        const foundersContainer = document.querySelector('#founders .container');
        if (foundersContainer && config.profiles.founders) {
            foundersContainer.innerHTML = '';
            config.profiles.founders.forEach(profile => {
                foundersContainer.appendChild(this.createCard(profile));
            });
        }

        const membersContainer = document.querySelector('#membersContainer');
        if (membersContainer && config.profiles.members) {
            membersContainer.innerHTML = '';
            config.profiles.members.forEach((profile, index) => {
                const card = this.createCard(profile);
                card.setAttribute('data-original-index', String(index));
                membersContainer.appendChild(card);
            });
        }

        document.dispatchEvent(new CustomEvent('cardsGenerated'));
    }

    createCard(profile) {
        const card = document.createElement('div');
        card.className = 'card';
        card.setAttribute('data-member', profile.name);
        if (profile.music) {
            const musicPath = window.configLoader?.resolveAssetUrl(profile.music) || profile.music;
            card.setAttribute('data-music', musicPath);
        }

        const iconPath = window.configLoader?.resolveAssetUrl(profile.icon) || profile.icon;

        card.innerHTML = `
            <div class="card-glow"></div>
            <div class="profile">
                <div class="profile-img-container">
                    <img src="${iconPath}" alt="${profile.displayName} profile" class="profile-img" loading="lazy" decoding="async" fetchpriority="low">
                    <div class="status-indicator" data-status="offline" title="Offline"></div>
                </div>
                <div class="name-tag">
                    <h2>${profile.displayName}</h2>
                </div>
                <div class="member-bio">${profile.bio}</div>
            </div>
        `;

        return card;
    }
}

window.cardGenerator = new CardGenerator();
