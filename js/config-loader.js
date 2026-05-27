

class ConfigLoader {
    constructor() {
        this.config = null;
        this.profiles = null;
        this.badges = null;
        this.platforms = null;
        this.loaded = false;
        this.loadPromise = null;
    }

    async load() {
        if (this.loaded) return this.config;
        if (this.loadPromise) return this.loadPromise;

        this.loadPromise = fetch('config.json')
            .then(response => {
                if (!response.ok) {
                    throw new Error('Failed to load config.json');
                }
                return response.json();
            })
            .then(data => {
                this.config = data;
                this.profiles = data.profiles;
                this.badges = data.badges;
                this.platforms = data.config.platforms;
                this.loaded = true;
                console.log('[Config] Loaded successfully');
                return data;
            })
            .catch(error => {
                console.error('[Config] Error loading:', error);
                return null;
            });

        return this.loadPromise;
    }

    getAllProfiles() {
        if (!this.profiles) return [];
        return [...(this.profiles.founders || []), ...(this.profiles.members || [])];
    }

    getProfile(memberName) {
        const all = this.getAllProfiles();
        return all.find(p => p.name.toLowerCase() === memberName.toLowerCase());
    }

    getDiscordId(memberName) {
        const profile = this.getProfile(memberName);
        if (profile && profile.socials && profile.socials.discord) {
            return profile.socials.discord;
        }
        return null;
    }

    getAllDiscordIds() {
        const ids = {};
        this.getAllProfiles().forEach(profile => {
            if (profile.socials && profile.socials.discord) {
                ids[profile.name] = profile.socials.discord;
            }
        });
        return ids;
    }

    getBadgeInfo(badgeName) {
        if (!this.badges) return null;
        return this.badges[badgeName] || null;
    }

    getMemberBadges(memberName) {
        const profile = this.getProfile(memberName);
        if (!profile || !profile.badges) return [];
        
        return profile.badges.map(badgeName => {
            const badgeInfo = this.getBadgeInfo(badgeName);
            if (badgeInfo) {
                return {
                    name: badgeName,
                    file: badgeInfo.file,
                    displayName: badgeInfo.displayName
                };
            }
            return null;
        }).filter(b => b !== null);
    }

    getPlatformInfo(platformName) {
        if (!this.platforms) return null;
        return this.platforms[platformName] || null;
    }

    getBadgesPath() {
        return this.config?.config?.badgesPath || 'assets/badges/';
    }

    resolveAssetUrl(assetPath) {
        if (!assetPath || typeof assetPath !== 'string') return assetPath;

        if (/^(?:[a-z]+:)?\/\//i.test(assetPath) || assetPath.startsWith('data:')) {
            return assetPath;
        }

        const assetBaseUrl = this.config?.config?.assetBaseUrl;
        if (!assetBaseUrl) {
            return assetPath;
        }

        const normalizedBase = assetBaseUrl.endsWith('/') ? assetBaseUrl : `${assetBaseUrl}/`;
        return new URL(assetPath.replace(/^\/+/, ''), normalizedBase).toString();
    }
}

window.configLoader = new ConfigLoader();
