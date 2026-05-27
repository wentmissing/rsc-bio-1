class ProfileMusicPlayer {
    constructor() {
        this.currentAudio = null;
        this.currentMusicPath = null;
        this.audioCache = new Map();
        this.isMuted = false;
        this.anthem = null;
        this.anthemPath = window.configLoader?.config?.config?.anthemUrl
            || 'https://github.com/zoxycontin/rsc-bio/raw/refs/heads/main/assets/songs/anthem.mp3';
        this.isPlayingProfile = false;
        this.fadeOutDuration = 300; // ms
        this.fadeInDuration = 1500; // ms (1.5 seconds)
        this.init();

        window.profileMusicPlayer = this;
    }

    init() {
        document.addEventListener('cardsGenerated', () => this.setupCardListeners());

        this.setupCardListeners();
        this.emitPlaybackState();
    }

    setupCardListeners() {
        const cards = document.querySelectorAll('.card');
        cards.forEach(card => {

            if (card.hasAttribute('data-music-listener')) return;
            card.setAttribute('data-music-listener', 'true');
            
            const musicPath = card.dataset.music;
            if (musicPath) {
                card.addEventListener('mouseenter', () => {
                    this.playMusic(musicPath);
                });
            }
        });
    }

    getAudio(musicPath) {
        if (!this.audioCache.has(musicPath)) {
            const audio = new Audio(musicPath);
            audio.preload = 'metadata';
            audio.volume = 0.25;
            audio.loop = true;
            this.audioCache.set(musicPath, audio);
        }

        return this.audioCache.get(musicPath);
    }

    ensureAnthem() {
        if (this.anthem) {
            return this.anthem;
        }

        this.anthem = new Audio(this.anthemPath);
        this.anthem.preload = 'metadata';
        this.anthem.loop = true;
        this.anthem.volume = 0.25;
        return this.anthem;
    }

    playMusic(musicPath) {
        if (this.isMuted) return;

        if (this.currentMusicPath === musicPath && this.currentAudio && !this.currentAudio.paused) {
            return;
        }

        if (this.currentAudio && !this.currentAudio.paused) {
            this.fadeOut(this.currentAudio);
        }

        if (this.anthem && !this.anthem.paused) {
            this.fadeOut(this.anthem);
        }
        
        const audio = this.getAudio(musicPath);
        if (audio) {
            this.currentAudio = audio;
            this.currentMusicPath = musicPath;
            this.isPlayingProfile = true;
            audio.currentTime = 0;

            audio.volume = 0;
            audio.play().catch(error => {
                console.log("Audio play failed:", error);
            });

            this.fadeIn(audio);

            this.updateNowPlaying(musicPath);
            this.emitPlaybackState();
        }
    }

    stopMusic() {
        if (this.currentAudio) {
            this.currentAudio.pause();
            this.currentAudio.currentTime = 0;
            this.currentAudio = null;
            this.currentMusicPath = null;
            this.isPlayingProfile = false;
        }
        this.emitPlaybackState();
    }

    fadeOut(audio) {
        const startVolume = audio.volume;
        const startTime = Date.now();
        
        const fade = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.fadeOutDuration, 1);
            audio.volume = startVolume * (1 - progress);
            
            if (progress < 1) {
                requestAnimationFrame(fade);
            } else {
                audio.pause();
                audio.currentTime = 0;
                audio.volume = startVolume; // Reset volume for next play
            }
        };
        
        fade();
    }

    fadeIn(audio) {
        const targetVolume = 0.25;
        const startTime = Date.now();
        
        const fade = () => {
            const elapsed = Date.now() - startTime;
            const progress = Math.min(elapsed / this.fadeInDuration, 1);
            audio.volume = targetVolume * progress;
            
            if (progress < 1) {
                requestAnimationFrame(fade);
            }
        };
        
        fade();
    }

    returnToAnthem() {
        if (this.isMuted) return;

        if (this.currentAudio && !this.currentAudio.paused) {
            this.fadeOut(this.currentAudio);
        }
        
        const anthem = this.ensureAnthem();
        if (anthem) {
            this.currentAudio = null;
            this.currentMusicPath = null;
            this.isPlayingProfile = false;
            anthem.currentTime = 0;
            anthem.volume = 0;
            anthem.play().catch(error => {
                console.log("Anthem play failed:", error);
            });

            this.fadeIn(anthem);
            this.updateNowPlaying('anthem');
            this.emitPlaybackState();
        }
    }
    
    updateNowPlaying(musicPath) {
        const npTrack = document.querySelector('.np-track');
        if (npTrack) {
            if (musicPath === 'anthem') {
                npTrack.textContent = 'RSC Anthem';
            } else {

                const trackName = musicPath.split('/').pop().replace('.mp3', '').replace('-theme', '');
                npTrack.textContent = trackName.charAt(0).toUpperCase() + trackName.slice(1) + "'s Theme";
            }
        }
    }
    
    setMuted(muted) {
        this.isMuted = muted;
        if (muted) {
            this.stopMusic();
            if (this.anthem) {
                this.anthem.pause();
            }
        }
        this.emitPlaybackState();
    }

    initAnthem() {
        const anthem = this.ensureAnthem();
        if (!this.isMuted && anthem && !this.isPlayingProfile) {
            anthem.play().catch(error => {
                console.log("Anthem autoplay failed:", error);
            });
            this.emitPlaybackState();
        }
    }

    hasActivePlayback() {
        return Boolean(
            (!this.isMuted && this.currentAudio && !this.currentAudio.paused) ||
            (!this.isMuted && this.anthem && !this.isPlayingProfile && !this.anthem.paused)
        );
    }

    emitPlaybackState() {
        document.dispatchEvent(new CustomEvent('musicstatechange', {
            detail: {
                hasActivePlayback: this.hasActivePlayback(),
                currentMusicPath: this.currentMusicPath,
                isMuted: this.isMuted
            }
        }));
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        window.profileMusicPlayer = new ProfileMusicPlayer();
    }, { once: true });
} else if (!window.profileMusicPlayer) {
    window.profileMusicPlayer = new ProfileMusicPlayer();
}
