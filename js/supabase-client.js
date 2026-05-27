class SupabaseService {
    constructor() {
        this.client = null;
        this.enabled = false;
        this.readyPromise = this.init();
    }

    async init() {
        if (!window.configLoader) {
            return;
        }

        await window.configLoader.load();
        const supabaseConfig = window.configLoader.config?.config?.supabase;
        const url = supabaseConfig?.url;
        const anonKey = supabaseConfig?.anonKey;

        if (!url || !anonKey) {
            console.warn('[Supabase] Missing url or anonKey in config.json. Using local fallback.');
            return;
        }

        if (!window.supabase || typeof window.supabase.createClient !== 'function') {
            console.error('[Supabase] SDK not loaded. Using local fallback.');
            return;
        }

        this.sessionId = this.getSessionId();
        this.client = window.supabase.createClient(url, anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });
        this.enabled = true;
        console.log('[Supabase] Connected');
    }

    getSessionId() {
        const key = 'rsc-visit-session-id';
        let id = sessionStorage.getItem(key);
        if (!id) {
            if (window.crypto && typeof window.crypto.randomUUID === 'function') {
                id = window.crypto.randomUUID();
            } else {
                id = `rsc-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
            }
            sessionStorage.setItem(key, id);
        }
        return id;
    }

    async getLikeCount(memberName) {
        if (!this.enabled) return null;

        const { data, error } = await this.client
            .from('profile_likes')
            .select('like_count')
            .eq('member_name', memberName)
            .maybeSingle();

        if (error) {
            console.error('[Supabase] Failed to read likes:', error.message);
            return null;
        }

        return data?.like_count ?? 0;
    }

    async incrementLike(memberName, delta, sessionId) {
        if (!this.enabled) return null;

        const sid = sessionId || this.sessionId || this.getSessionId();
        const { data, error } = await this.client.rpc('increment_profile_likes', {
            p_member_name: memberName,
            p_delta: delta,
            p_session_id: sid
        });

        if (error) {
            console.error('[Supabase] Failed to update likes:', error.message);
            return null;
        }

        if (typeof data === 'number') {
            return Math.max(0, data);
        }
        if (Array.isArray(data) && typeof data[0] === 'number') {
            return Math.max(0, data[0]);
        }
        return null;
    }

    async trackVisitForSession(sessionId) {
        if (!this.enabled) return null;

        const { data, error } = await this.client.rpc('increment_site_visits', {
            p_session_id: sessionId
        });

        if (error) {
            console.error('[Supabase] Failed to track visit:', error.message);
            return null;
        }

        if (typeof data === 'number') {
            return Math.max(0, data);
        }
        if (Array.isArray(data) && typeof data[0] === 'number') {
            return Math.max(0, data[0]);
        }
        return null;
    }

    async getVisitCount() {
        if (!this.enabled) return null;

        const { data, error } = await this.client
            .from('site_metrics')
            .select('metric_value')
            .eq('metric_name', 'site_visits')
            .maybeSingle();

        if (error) {
            console.error('[Supabase] Failed to read site visits:', error.message);
            return null;
        }

        return data?.metric_value ?? 0;
    }

    async getRecentScores(limit = 5) {
        if (!this.enabled) return [];

        const { data, error } = await this.client
            .from('scores')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Supabase] Failed to fetch recent scores:', error.message);
            return [];
        }
        return data ?? [];
    }

    async getTopScores(limit = 3) {
        if (!this.enabled) return [];

        const { data, error } = await this.client
            .from('scores')
            .select('*')
            .order('awarded_sp', { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Supabase] Failed to fetch top scores:', error.message);
            return [];
        }
        return data ?? [];
    }

    async getMemberRecentScores({ rhythiaUserId = null, username = null, limit = 5 } = {}) {
        if (!this.enabled) return [];

        const byId = await this.queryScoresByUserId(rhythiaUserId, 'created_at', limit);
        if (byId.length) {
            return byId;
        }

        return this.queryScoresByUsername(username, 'created_at', limit);
    }

    async getMemberTopScores({ rhythiaUserId = null, username = null, limit = 5 } = {}) {
        if (!this.enabled) return [];

        const byId = await this.queryScoresByUserId(rhythiaUserId, 'awarded_sp', limit);
        if (byId.length) {
            return byId;
        }

        return this.queryScoresByUsername(username, 'awarded_sp', limit);
    }

    async queryScoresByUserId(rhythiaUserId, orderColumn, limit) {
        if (!rhythiaUserId) return [];

        const { data, error } = await this.client
            .from('scores')
            .select('*')
            .eq('user_id', String(rhythiaUserId))
            .order(orderColumn, { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Supabase] Failed to fetch member scores by user_id:', error.message);
            return [];
        }

        return data ?? [];
    }

    async queryScoresByUsername(username, orderColumn, limit) {
        if (!username) return [];

        const normalized = String(username).trim();
        if (!normalized) return [];

        let { data, error } = await this.client
            .from('scores')
            .select('*')
            .eq('username', normalized)
            .order(orderColumn, { ascending: false })
            .limit(limit);

        if (error) {
            console.error('[Supabase] Failed to fetch member scores by username:', error.message);
            return [];
        }

        if (data && data.length) {
            return data;
        }

        ({ data, error } = await this.client
            .from('scores')
            .select('*')
            .ilike('username', normalized)
            .order(orderColumn, { ascending: false })
            .limit(limit));

        if (error) {
            console.error('[Supabase] Failed to fetch member scores by username (ilike):', error.message);
            return [];
        }

        return data ?? [];
    }
}

window.supabaseService = new SupabaseService();