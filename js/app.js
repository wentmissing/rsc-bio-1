class RSCApp {
    constructor() {
        this.currentSection = 'about';
        this.isAudioInitialized = false;
        this.isMuted = false;
        this.currentVolume = 25;
        this.theme = localStorage.getItem('rsc-theme') || 'dark';
        this.scriptPromises = new Map();
        this.visualizerSync = null;

        this.init();
    }

    init() {
        this.setupTheme();
        this.setupNavigation();
        this.setupAudioControls();
        this.setupSearch();
        this.setupBackToTop();
        this.setupAnimations();
        this.setupAudioVisualizer();
        this.setupLiveStats();

        document.addEventListener('click', () => this.initAudio(), { once: true });

        document.addEventListener('cardsGenerated', () => {
            this.setupAnimations();
        });

        this.ensureRouteFeatures();
    }

    loadScript(src) {
        if (this.scriptPromises.has(src)) {
            return this.scriptPromises.get(src);
        }

        const existingScript = document.querySelector(`script[src="${src}"]`);
        if (existingScript) {
            const resolved = Promise.resolve();
            this.scriptPromises.set(src, resolved);
            return resolved;
        }

        const promise = new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = src;
            script.defer = true;
            script.onload = () => resolve();
            script.onerror = () => reject(new Error(`Failed to load ${src}`));
            document.head.appendChild(script);
        });

        this.scriptPromises.set(src, promise);
        return promise;
    }

    ensureMusicFeature() {
        return this.loadScript('js/profile-music.js');
    }

    ensureCardClickFeature() {
        return this.loadScript('js/card-click.js');
    }

    ensurePresenceFeature() {
        return this.loadScript('js/lanyard.js');
    }

    ensureScoresFeature() {
        return this.loadScript('js/scores.js');
    }

    ensureSectionFeatures(sectionId) {
        if (sectionId === 'founders') {
            this.ensureCardClickFeature();
            this.ensureMusicFeature();
            return;
        }

        if (sectionId === 'members') {
            this.ensureCardClickFeature();
            this.ensureMusicFeature();
            this.ensurePresenceFeature();
            return;
        }

        if (sectionId === 'scores') {
            this.ensureScoresFeature();
        }
    }

    ensureRouteFeatures() {
        const memberPath = window.location.pathname.replace(/^\//, '');
        if (!memberPath || memberPath.includes('.') || memberPath.includes('/')) {
            return;
        }

        this.ensureCardClickFeature();
        this.ensureMusicFeature();
        this.ensurePresenceFeature();
    }

    async setupLiveStats() {
        const membersStat = this.getStatCardByLabel('members');
        const visitsStat = this.getStatCardByLabel('site visits');
        if (!membersStat || !visitsStat) return;

        const [memberResult, visitsResult] = await Promise.allSettled([
            this.fetchDiscordMemberCount(),
            this.fetchSiteVisitCount()
        ]);

        const memberCount = memberResult.status === 'fulfilled' ? memberResult.value : null;
        const visitCount = visitsResult.status === 'fulfilled' ? visitsResult.value : null;

        if (memberCount != null) {
            membersStat.setAttribute('data-target', String(memberCount));
            if (document.getElementById('about').classList.contains('active')) {
                this.animateStats([membersStat]);
            }
        }

        if (visitCount != null) {
            visitsStat.setAttribute('data-target', String(visitCount));
            if (document.getElementById('about').classList.contains('active')) {
                this.animateStats([visitsStat]);
            }
        }
    }

    getStatCardByLabel(labelText) {
        const cards = document.querySelectorAll('#about .stat-card');
        for (const card of cards) {
            const label = card.querySelector('.stat-label');
            if (label && label.textContent.trim().toLowerCase() === labelText.toLowerCase()) {
                return card.querySelector('.stat-number');
            }
        }
        return null;
    }

    
    async fetchDiscordMemberCount() {
        let widgetUrl = 'https://discord.com/api/guilds/1313352737710145577/widget.json';
        let inviteUrl = 'https://discord.com/api/v10/invites/442jszx9ae?with_counts=true';
        if (window.configLoader && window.configLoader.loaded) {
            const configuredWidgetUrl = window.configLoader.config?.config?.discordWidgetUrl;
            if (configuredWidgetUrl && typeof configuredWidgetUrl === 'string') {
                widgetUrl = configuredWidgetUrl;
            }

            const discord = window.configLoader.config?.config?.discord;
            if (discord && typeof discord === 'string') {
                const match = discord.match(/discord\.gg\/([a-zA-Z0-9]+)/) || discord.match(/invite\/([a-zA-Z0-9]+)/);
                if (match) inviteUrl = `https://discord.com/api/v10/invites/${match[1]}?with_counts=true`;
            }
        }

        try {
            const widgetRes = await fetch(widgetUrl);
            if (widgetRes.ok) {
                const widgetData = await widgetRes.json();
                if (typeof widgetData?.member_count === 'number') {
                    return widgetData.member_count;
                }
            }
        } catch (_) {
        }

        const proxyUrl = 'https://api.allorigins.win/raw?url=' + encodeURIComponent(inviteUrl);
        const res = await fetch(proxyUrl);
        if (!res.ok) return null;
        const data = await res.json();
        return data.approximate_member_count ?? null;
    }

    
    async fetchSiteVisitCount() {
        const storageKey = 'rsc-site-visits-fallback';
        const sessionCountedKey = 'rsc-visit-counted';
        const sessionIdKey = 'rsc-visit-session-id';

        const getFallbackCount = () => {
            let visits = parseInt(localStorage.getItem(storageKey), 10) || 0;
            if (!sessionStorage.getItem(sessionCountedKey)) {
                visits++;
                localStorage.setItem(storageKey, String(visits));
                sessionStorage.setItem(sessionCountedKey, 'true');
            }
            return visits;
        };

        if (!window.supabaseService) {
            return getFallbackCount();
        }

        await window.supabaseService.readyPromise;
        if (!window.supabaseService.enabled) {
            return getFallbackCount();
        }

        let sessionId = sessionStorage.getItem(sessionIdKey);
        if (!sessionId) {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                sessionId = window.crypto.randomUUID();
            } else {
                sessionId = `rsc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            }
            sessionStorage.setItem(sessionIdKey, sessionId);
        }

        if (!sessionStorage.getItem(sessionCountedKey)) {
            const updatedCount = await window.supabaseService.trackVisitForSession(sessionId);
            if (typeof updatedCount === 'number') {
                sessionStorage.setItem(sessionCountedKey, 'true');
                return updatedCount;
            }
        }

        const remoteCount = await window.supabaseService.getVisitCount();
        if (typeof remoteCount === 'number') {
            return remoteCount;
        }

        return getFallbackCount();
    }

    setupTheme() {
        const themeToggle = document.getElementById('themeToggle');

        if (!themeToggle) return;
        
        const sunIcon = themeToggle.querySelector('.sun-icon');
        const moonIcon = themeToggle.querySelector('.moon-icon');
        
        if (!sunIcon || !moonIcon) return;

        if (this.theme === 'light') {
            document.documentElement.setAttribute('data-theme', 'light');
            sunIcon.classList.add('hidden');
            moonIcon.classList.remove('hidden');
        }

        themeToggle.addEventListener('click', () => {
            this.theme = this.theme === 'dark' ? 'light' : 'dark';
            localStorage.setItem('rsc-theme', this.theme);

            if (this.theme === 'light') {
                document.documentElement.setAttribute('data-theme', 'light');
                sunIcon.classList.add('hidden');
                moonIcon.classList.remove('hidden');
            } else {
                document.documentElement.removeAttribute('data-theme');
                sunIcon.classList.remove('hidden');
                moonIcon.classList.add('hidden');
            }
        });
    }

    setupNavigation() {
        const sections = document.querySelectorAll('.content-section');
        const navLinks = document.querySelectorAll('.nav-link');

        window.showSection = (sectionId) => {
            this.ensureSectionFeatures(sectionId);
            sections.forEach(section => section.classList.remove('active'));
            const targetSection = document.getElementById(sectionId);
            if (targetSection) {
                targetSection.classList.add('active');
                this.currentSection = sectionId;

                navLinks.forEach(link => {
                    if (link.getAttribute('href') === `#${sectionId}`) {
                        link.style.color = 'var(--primary)';
                    } else if (!link.getAttribute('href').startsWith('http')) {
                        link.style.color = 'var(--text-secondary)';
                    }
                });

                if (sectionId === 'about') {
                    this.animateStats();
                }
            }
        };

        showSection('about');
    }

    animateStats(onlyTheseStats = null) {
        const statNumbers = onlyTheseStats || document.querySelectorAll('.stat-number');
        const list = Array.isArray(onlyTheseStats) ? onlyTheseStats : [...statNumbers];

        list.forEach(stat => {
            const target = parseInt(stat.getAttribute('data-target'), 10);
            if (isNaN(target)) return;
            const start = parseInt(stat.textContent.replace(/\D/g, ''), 10) || 0;
            const duration = 2000;
            const steps = 60;
            const diff = target - start;
            const increment = diff / steps;
            let current = start;

            const timer = setInterval(() => {
                current += increment;
                if ((increment >= 0 && current >= target) || (increment < 0 && current <= target)) {
                    stat.textContent = target.toLocaleString();
                    clearInterval(timer);
                } else {
                    stat.textContent = Math.floor(current).toLocaleString();
                }
            }, duration / steps);
        });
    }

    setupAudioControls() {
        const muteBtn = document.getElementById('muteBtn');
        const volumeSlider = document.getElementById('volumeSlider');
        const volumeValue = document.querySelector('.volume-value');

        muteBtn.addEventListener('click', async () => {
            this.isMuted = !this.isMuted;

            if (this.isMuted) {
                muteBtn.classList.add('muted');
                if (window.profileMusicPlayer) {
                    window.profileMusicPlayer.setMuted(true);
                }
            } else {
                muteBtn.classList.remove('muted');
                await this.ensureMusicFeature();
                if (window.profileMusicPlayer) {
                    window.profileMusicPlayer.setMuted(false);
                    window.profileMusicPlayer.initAnthem();
                }
            }
        });

        volumeSlider.addEventListener('input', (e) => {
            this.currentVolume = parseInt(e.target.value);
            volumeValue.textContent = `${this.currentVolume}%`;

            if (window.profileMusicPlayer) {
                const volume = this.currentVolume / 100;
                if (window.profileMusicPlayer.anthem) {
                    window.profileMusicPlayer.anthem.volume = volume;
                }
                if (window.profileMusicPlayer.currentAudio) {
                    window.profileMusicPlayer.currentAudio.volume = volume;
                }

                window.profileMusicPlayer.audioCache.forEach(audio => {
                    audio.volume = volume;
                });
            }
        });
    }

    async initAudio() {
        if (!this.isAudioInitialized && !this.isMuted) {
            await this.ensureMusicFeature();
            if (window.profileMusicPlayer) {
                window.profileMusicPlayer.initAnthem();
            }
            this.isAudioInitialized = true;
        }
    }

    setupSearch() {
        const searchInput = document.getElementById('memberSearch');
        if (!searchInput) return;

        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.toLowerCase();
            const cards = document.querySelectorAll('#membersContainer .card');

            cards.forEach(card => {
                const nameTag = card.querySelector('.name-tag h2');
                const memberName = nameTag ? nameTag.textContent.toLowerCase() : '';

                if (memberName.includes(searchTerm)) {
                    card.style.display = '';
                    card.style.animation = 'cardAppear 0.6s ease-out';
                } else {
                    card.style.display = 'none';
                }
            });
        });
    }

    setupBackToTop() {
        const backToTop = document.getElementById('backToTop');

        window.addEventListener('scroll', () => {
            if (window.scrollY > 300) {
                backToTop.classList.add('visible');
            } else {
                backToTop.classList.remove('visible');
            }
        });

        backToTop.addEventListener('click', () => {
            window.scrollTo({
                top: 0,
                behavior: 'smooth'
            });
        });
    }

    setupAnimations() {
        const observerOptions = {
            threshold: 0.1,
            rootMargin: '0px 0px -50px 0px'
        };

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.transform = 'translateY(0)';
                }
            });
        }, observerOptions);

        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {
            observer.observe(card);
        });
    }

    setupAudioVisualizer() {
        const canvas = document.getElementById('audioVisualizer');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = 150;

        let bars = [];
        const barCount = 50;
        let animationFrameId = null;
        let isAnimating = false;

        for (let i = 0; i < barCount; i++) {
            bars.push({
                x: (canvas.width / barCount) * i,
                height: Math.random() * 50 + 20,
                velocity: Math.random() * 2 - 1
            });
        }

        const animate = () => {
            if (!isAnimating) {
                return;
            }

            if (!this.shouldRunVisualizer()) {
                isAnimating = false;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
                return;
            }

            ctx.clearRect(0, 0, canvas.width, canvas.height);

            bars.forEach((bar, i) => {
                bar.height += bar.velocity;

                if (bar.height > 100 || bar.height < 10) {
                    bar.velocity *= -1;
                }

                const gradient = ctx.createLinearGradient(0, canvas.height - bar.height, 0, canvas.height);
                gradient.addColorStop(0, 'rgba(84, 179, 214, 0.8)');
                gradient.addColorStop(1, 'rgba(199, 125, 255, 0.8)');

                ctx.fillStyle = gradient;
                ctx.fillRect(bar.x, canvas.height - bar.height, canvas.width / barCount - 2, bar.height);
            });

            animationFrameId = requestAnimationFrame(animate);
        };

        this.visualizerSync = () => {
            if (this.shouldRunVisualizer()) {
                if (!isAnimating) {
                    isAnimating = true;
                    animate();
                }
            } else {
                isAnimating = false;
                if (animationFrameId) {
                    cancelAnimationFrame(animationFrameId);
                    animationFrameId = null;
                }
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        };

        document.addEventListener('visibilitychange', this.visualizerSync);
        document.addEventListener('musicstatechange', this.visualizerSync);
        this.visualizerSync();

        window.addEventListener('resize', () => {
            canvas.width = window.innerWidth;
            bars = bars.map((bar, i) => ({
                ...bar,
                x: (canvas.width / barCount) * i
            }));
            if (this.visualizerSync) {
                this.visualizerSync();
            }
        });
    }

    shouldRunVisualizer() {
        if (document.hidden || this.isMuted) {
            return false;
        }

        return Boolean(window.profileMusicPlayer && window.profileMusicPlayer.hasActivePlayback());
    }


    selectRandomMember() {
        const cards = Array.from(document.querySelectorAll('#membersContainer .card[data-member]'));
        if (cards.length === 0) return;

        const card = cards[Math.floor(Math.random() * cards.length)];

        if (window.cardClickHandler && typeof window.cardClickHandler.expandCard === 'function') {
            window.cardClickHandler.expandCard(card);
            return;
        }

        card.click();
    }
}

let app;
document.addEventListener('DOMContentLoaded', () => {
    app = new RSCApp();

    window.selectRandomMember = () => app.selectRandomMember();
});
