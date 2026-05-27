class CardClickHandler {
    constructor() {
        this.overlay = null;
        this.currentExpandedCard = null;
        this.localLikesKey = 'rsc-profile-likes-local';
        this.userLikesKey = 'rsc-profile-liked-members';
        this.activityIntervalId = null;
        this.init();

        window.cardClickHandler = this;
    }

    sanitizeKey(memberName) {
        return memberName.toLowerCase().replace(/[^a-z0-9]/g, '-');
    }

    getUserLikes() {
        return JSON.parse(localStorage.getItem(this.userLikesKey) || '{}');
    }

    isMemberLiked(memberName) {
        const likes = this.getUserLikes();
        return !!likes[memberName];
    }

    setMemberLiked(memberName, isLiked) {
        const likes = this.getUserLikes();
        if (isLiked) {
            likes[memberName] = true;
        } else {
            delete likes[memberName];
        }
        localStorage.setItem(this.userLikesKey, JSON.stringify(likes));
    }

    getLocalLikes() {
        return JSON.parse(localStorage.getItem(this.localLikesKey) || '{}');
    }

    getLocalLikeCount(memberName) {
        const local = this.getLocalLikes();
        return local[memberName] || 0;
    }

    setLocalLikeCount(memberName, value) {
        const local = this.getLocalLikes();
        local[memberName] = Math.max(0, value);
        localStorage.setItem(this.localLikesKey, JSON.stringify(local));
        return local[memberName];
    }

    async fetchLikes(memberName) {
        const fallbackCount = this.getLocalLikeCount(memberName);

        if (!window.supabaseService) {
            return fallbackCount;
        }

        await window.supabaseService.readyPromise;
        if (!window.supabaseService.enabled) {
            return fallbackCount;
        }

        try {
            const remoteCount = await window.supabaseService.getLikeCount(memberName);
            if (typeof remoteCount === 'number') {
                return remoteCount;
            }
        } catch (_) {
            return fallbackCount;
        }
        return fallbackCount;
    }

    async updateLikes(memberName, delta) {
        const localCount = this.setLocalLikeCount(memberName, this.getLocalLikeCount(memberName) + delta);

        if (!window.supabaseService) {
            return localCount;
        }

        await window.supabaseService.readyPromise;
        if (!window.supabaseService.enabled) {
            return localCount;
        }

        try {
            const sessionId = window.supabaseService.sessionId || window.supabaseService.getSessionId();
            const remoteCount = await window.supabaseService.incrementLike(memberName, delta, sessionId);
            if (typeof remoteCount === 'number') {
                return remoteCount;
            }
        } catch (_) {
            return localCount;
        }
        return localCount;
    }

    updateLikeUi(cardElement, likeCount, isLiked) {
        if (!cardElement) return;

        const likeCountEl = cardElement.querySelector('.like-count');
        const likeLabelEl = cardElement.querySelector('.like-label');
        const likeBtn = cardElement.querySelector('.profile-like-btn');

        if (likeCountEl && typeof likeCount === 'number') {
            likeCountEl.textContent = likeCount;
        }
        if (likeLabelEl && typeof likeCount === 'number') {
            likeLabelEl.textContent = likeCount === 1 ? 'like' : 'likes';
        }
        if (likeBtn) {
            likeBtn.classList.toggle('liked', isLiked);
            likeBtn.setAttribute('aria-pressed', isLiked ? 'true' : 'false');
            likeBtn.setAttribute('title', isLiked ? 'Unlike profile' : 'Like profile');
        }
    }

    async handleLikeToggle(memberName, cardElement) {
        const likeBtn = cardElement.querySelector('.profile-like-btn');
        if (!likeBtn || likeBtn.disabled) return;

        const currentlyLiked = this.isMemberLiked(memberName);
        const delta = currentlyLiked ? -1 : 1;
        const newLikedState = !currentlyLiked;

        likeBtn.disabled = true;
        try {
            const updatedCount = await this.updateLikes(memberName, delta);
            this.setMemberLiked(memberName, newLikedState);
            this.updateLikeUi(cardElement, updatedCount, newLikedState);
        } catch (_) {
            this.updateLikeUi(cardElement, this.getLocalLikeCount(memberName), this.isMemberLiked(memberName));
        } finally {
            likeBtn.disabled = false;
        }
    }

    init() {
        this.createOverlay();

        document.addEventListener('cardsGenerated', () => this.attachCardListeners());

        this.attachCardListeners();

        this.checkUrlForMember();

        window.addEventListener('popstate', () => {
            this.checkUrlForMember();
        });

        document.addEventListener('lanyardPresenceUpdate', (e) => {
            const { memberName } = e.detail || {};
            if (!memberName || !this.currentExpandedCard || this.currentExpandedCard.getAttribute('data-member') !== memberName) return;
            this.refreshActivityBlock(memberName);
        });
    }

    refreshActivityBlock(memberName) {
        if (!this.currentExpandedCard) return;
        const block = this.currentExpandedCard.querySelector('.activity-status');
        if (!block) return;
        block.innerHTML = this.getActivityText(memberName);
        if (this.activityIntervalId) {
            clearInterval(this.activityIntervalId);
            this.activityIntervalId = null;
        }
        this.startActivityTimer(memberName);
    }

    attachCardListeners() {
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {

            if (!card.hasAttribute('data-click-handler')) {
                card.setAttribute('data-click-handler', 'true');
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.expandCard(card);
                });
            }
        });
    }

    checkUrlForMember() {
        const path = window.location.pathname;
        const memberName = path.replace(/^\//, '');
        if (memberName && memberName !== '' && !memberName.includes('.') && !memberName.includes('/')) {

            const tryOpen = () => {
                const card = document.querySelector(`.card[data-member="${memberName}"]`);
                if (card && !this.currentExpandedCard) {
                    this.expandCard(card);
                }
            };

            tryOpen();

            document.addEventListener('cardsGenerated', tryOpen, { once: true });
        }
    }

    createOverlay() {

        this.overlay = document.getElementById('cardOverlay') || document.querySelector('.card-overlay');
        
        if (!this.overlay) {
            this.overlay = document.createElement('div');
            this.overlay.className = 'card-overlay';
            document.body.appendChild(this.overlay);
        }

        this.overlay.addEventListener('click', () => {
            this.closeCard();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && this.currentExpandedCard) {
                this.closeCard();
            }
        });
    }

    expandCard(originalCard) {
        this.closeCard();

        const memberName = originalCard.getAttribute('data-member');
        const musicPath = originalCard.getAttribute('data-music');

        if (musicPath && window.profileMusicPlayer) {
            window.profileMusicPlayer.playMusic(musicPath);
        }

        const expandedCard = document.createElement('div');
        expandedCard.className = 'card-expanded';

        const profileImg = originalCard.querySelector('.profile-img');
        const nameTag = originalCard.querySelector('.name-tag h2');
        const tag = originalCard.querySelector('.tag');
        const memberBio = originalCard.querySelector('.member-bio');
        const statusIndicator = originalCard.querySelector('.status-indicator');

        const fullName = nameTag ? nameTag.textContent.trim() : memberName;
        const tagText = tag ? tag.textContent.trim() : '';

        let statusHtml = '';
        if (statusIndicator) {
            const status = statusIndicator.getAttribute('data-status') || 'offline';
            const title = statusIndicator.getAttribute('title') || '';
            statusHtml = `<div class="status-indicator" data-status="${status}" title="${title}"></div>`;
        }

        const badgeIcons = this.getBadgeIcons(memberName);

        const activityText = this.getActivityText(memberName);
        const socialLinksHtml = this.getSocialLinksHtml(memberName);

        expandedCard.innerHTML = `
            <div class="expanded-top">
                <div class="profile-img-container">
                    <img src="${profileImg.src}" alt="${profileImg.alt}" class="profile-img">
                    ${statusHtml}
                </div>
                <div class="profile-info">
                    <div class="name-section">
                        <h2>${fullName}</h2>
                        <div class="badge-container">
                            ${badgeIcons}
                        </div>
                    </div>
                </div>
            </div>
            <div class="activity-status" data-member="${memberName}">${activityText}</div>
            ${memberBio ? `<div class="member-bio">${memberBio.innerHTML}</div>` : ''}
            ${socialLinksHtml}
            <div class="profile-likes">
                <button class="profile-like-btn" type="button" aria-pressed="false" title="Like profile" aria-label="Like profile">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path>
                    </svg>
                </button>
                <span class="like-count">...</span>
                <span class="like-label">likes</span>
            </div>
        `;

        document.body.appendChild(expandedCard);

        expandedCard.setAttribute('data-member', memberName);

        this.overlay.classList.add('active');
        this.currentExpandedCard = expandedCard;

        this.startActivityTimer(memberName);

        if (memberName) {
            window.history.pushState(null, '', `/${memberName}`);
        }

        const likeButton = expandedCard.querySelector('.profile-like-btn');
        if (likeButton) {
            likeButton.addEventListener('click', (event) => {
                event.stopPropagation();
                this.handleLikeToggle(memberName, expandedCard);
            });
        }

        const initiallyLiked = this.isMemberLiked(memberName);
        this.updateLikeUi(expandedCard, this.getLocalLikeCount(memberName), initiallyLiked);

        this.fetchLikes(memberName).then((likeCount) => {
            this.setLocalLikeCount(memberName, likeCount);
            this.updateLikeUi(expandedCard, this.getLocalLikeCount(memberName), this.isMemberLiked(memberName));
        }).catch(() => {
        });

        setTimeout(() => {
            expandedCard.classList.add('active');
        }, 10);

        document.body.style.overflow = 'hidden';
    }

    getSocialLinksHtml(memberName) {
        if (!window.configLoader || !window.configLoader.loaded) return '';

        const profile = window.configLoader.getProfile(memberName);
        if (!profile || !profile.socials) return '';

        const socials = profile.socials;
        const entries = Object.entries(socials);
        if (entries.length === 0) return '';

        const linksHtml = entries.map(([platformName, handle]) => {
            const platformInfo = window.configLoader.getPlatformInfo(platformName);
            if (!platformInfo || !handle) return '';

            const href = `${platformInfo.link}${handle}`;
            const icon = platformInfo.icon;
            const label = platformName.charAt(0).toUpperCase() + platformName.slice(1);

            return `
                <a href="${href}" target="_blank" rel="noopener noreferrer"
                   class="social-link" aria-label="${label}">
                    <img src="${window.configLoader.resolveAssetUrl(icon)}" alt="${label}" loading="lazy" decoding="async">
                </a>
            `;
        }).filter(Boolean).join('');

        if (!linksHtml) return '';

        return `<div class="social-links">${linksHtml}</div>`;
    }

    getBadgeIcons(memberName) {

        if (window.configLoader && window.configLoader.loaded) {
            const badges = window.configLoader.getMemberBadges(memberName);
            const badgesPath = window.configLoader.getBadgesPath();
            
            if (badges.length > 0) {
                return badges.map(badge => {
                    return `<div class="badge-wrapper">
                        <img src="${window.configLoader.resolveAssetUrl(`${badgesPath}${badge.file}`)}" alt="${badge.displayName}" class="badge-icon" loading="lazy" decoding="async">
                        <span class="badge-tooltip">${badge.displayName}</span>
                    </div>`;
                }).join('');
            }
        }
        return '';
    }

    getActivityText(memberName) {
        if (window.lanyardIntegration) {
            const state = window.lanyardIntegration.getUserState(memberName);
            if (state && state.activities && state.activities.length > 0) {
                const activity = state.activities.find(a => a.type === 0 || a.type === 3);
                
                if (activity && !activity.name.includes('Custom Status')) {
                    let activityHtml = '';
                    let activityIcon = '';
                    let activityName = activity.name || 'Unknown Activity';
                    let activityDetails = activity.details || '';
                    let activityState = activity.state || '';
                    let elapsed = '';

                    if (activity.assets && activity.assets.large_image) {
                        const imageId = activity.assets.large_image;
                        if (imageId.startsWith('mp:')) {
                            activityIcon = `<img src="https://media.discordapp.net/${imageId.replace('mp:', '')}" alt="${activityName}">`;
                        } else {
                            activityIcon = `<img src="https://cdn.discordapp.com/app-assets/${activity.application_id}/${imageId}.png" alt="${activityName}">`;
                        }
                    }
                    
                    if (!activityIcon) {
                        activityIcon = '<span style="font-size: 24px;">🎮</span>';
                    }

                    if (activity.timestamps && activity.timestamps.start) {
                        const start = activity.timestamps.start;
                        const now = Date.now();
                        const diff = now - start;
                        const totalSeconds = Math.floor(diff / 1000);
                        const seconds = totalSeconds % 60;
                        const minutes = Math.floor(totalSeconds / 60);
                        const hours = Math.floor(minutes / 60);
                        const mins = minutes % 60;
                        if (hours > 0) {
                            elapsed = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} elapsed`;
                        } else {
                            elapsed = `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} elapsed`;
                        }
                    }

                    let description = '';
                    if (activityDetails && activityState) {
                        description = `${activityDetails}<br>${activityState}`;
                    } else if (activityDetails) {
                        description = activityDetails;
                    } else if (activityState) {
                        description = activityState;
                    }

                    activityHtml = `
                        <div class="activity-icon">${activityIcon}</div>
                        <div class="activity-details">
                            <div class="activity-name">${activityName}</div>
                            ${description ? `<div class="activity-description">${description}</div>` : ''}
                            ${elapsed ? `<div class="activity-time">${elapsed}</div>` : ''}
                        </div>
                    `;
                    
                    return activityHtml;
                }
            }
        }
        return '<div class="activity-icon"><span style="font-size: 24px;">💤</span></div><div class="activity-details"><div class="activity-name">Offline</div></div>';
    }

    closeCard() {
        if (this.activityIntervalId) {
            clearInterval(this.activityIntervalId);
            this.activityIntervalId = null;
        }

        if (this.currentExpandedCard) {
            document.body.removeChild(this.currentExpandedCard);
            this.currentExpandedCard = null;
        }

        this.overlay.classList.remove('active');

        if (window.location.pathname !== '/') {
            window.history.pushState(null, '', '/');
        }

        document.body.style.overflow = '';
    }

    startActivityTimer(memberName) {
        if (!window.lanyardIntegration) return;

        if (this.activityIntervalId) {
            clearInterval(this.activityIntervalId);
            this.activityIntervalId = null;
        }

        const updateElapsed = () => {
            if (!this.currentExpandedCard) return;

            const activityTimeEl = this.currentExpandedCard.querySelector('.activity-time');
            if (!activityTimeEl) return;

            const state = window.lanyardIntegration.getUserState(memberName);
            if (!state || !state.activities || state.activities.length === 0) return;

            const activity = state.activities.find(a => a.type === 0 || a.type === 3);
            if (!activity || !activity.timestamps || !activity.timestamps.start) return;

            const start = activity.timestamps.start;
            const now = Date.now();
            const diff = now - start;
            const totalSeconds = Math.floor(diff / 1000);
            const seconds = totalSeconds % 60;
            const minutes = Math.floor(totalSeconds / 60);
            const hours = Math.floor(minutes / 60);
            const mins = minutes % 60;

            if (hours > 0) {
                activityTimeEl.textContent = `${hours.toString().padStart(2, '0')}:${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} elapsed`;
            } else {
                activityTimeEl.textContent = `${mins.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')} elapsed`;
            }
        };

        updateElapsed();
        this.activityIntervalId = setInterval(updateElapsed, 1000);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        if (!window.cardClickHandler) {
            new CardClickHandler();
        }
    }, { once: true });
} else if (!window.cardClickHandler) {
    new CardClickHandler();
}
