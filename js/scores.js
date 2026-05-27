(async function loadScores() {
    const [recent, top] = await getScoreData();

    const medals = ['🥇', '🥈', '🥉'];

    function buildCard(score, opts) {
        const card = document.createElement('article');
        card.className = 'score-card' + (opts.top ? ' top-score-card' : '');

        const left = opts.top
            ? `<div class="top-score-medal">${opts.medal}</div>`
            : `<div class="score-rank">#${score.misses === 0 ? 'FC' : score.misses}</div>`;

        const mapTitle = score.beatmap_title ?? 'Unknown';
        const player = score.username ?? 'Unknown';
        const rp = score.awarded_sp != null ? Number(score.awarded_sp).toLocaleString(undefined, { maximumFractionDigits: 1 }) : '?';

        card.innerHTML = [
            left,
            score.beatmap_image_url ? `<img class="score-thumb" src="${encodeURI(score.beatmap_image_url)}" alt="" loading="lazy">` : '',
            `<div class="score-info">`,
            `  <span class="score-player">${escapeHtml(player)}</span>`,
            `  <span class="score-map">${escapeHtml(mapTitle)}</span>`,
            `</div>`,
            `<div class="score-value${opts.accent ? ' accent' : ''}">${rp} rp</div>`,
        ].join('');

        return card;
    }

    async function getScoreData() {
        const fromSnapshots = await getScoresFromConfigSnapshots();
        if (fromSnapshots.recent.length || fromSnapshots.top.length) {
            return [fromSnapshots.recent, fromSnapshots.top];
        }

        if (!window.supabaseService) return [[], []];
        await window.supabaseService.readyPromise;
        if (!window.supabaseService.enabled) return [[], []];

        const [recent, top] = await Promise.all([
            window.supabaseService.getRecentScores(5),
            window.supabaseService.getTopScores(3),
        ]);

        return [recent || [], top || []];
    }

    async function getScoresFromConfigSnapshots() {
        if (!window.configLoader) return { recent: [], top: [] };

        await window.configLoader.load();
        const profiles = window.configLoader.getAllProfiles ? window.configLoader.getAllProfiles() : [];
        const allScores = [];

        profiles.forEach((profile) => {
            const recent = profile?.scores?.recent;
            if (!Array.isArray(recent) || !recent.length) return;

            recent.forEach((rawScore) => {
                const mapped = mapSnapshotScore(rawScore, profile);
                if (mapped) allScores.push(mapped);
            });
        });

        if (!allScores.length) {
            return { recent: [], top: [] };
        }

        const byRecent = [...allScores]
            .sort((a, b) => b._sortTime - a._sortTime)
            .slice(0, 5)
            .map(stripSortMeta);

        const byTop = [...allScores]
            .sort((a, b) => b._sortRp - a._sortRp)
            .slice(0, 3)
            .map(stripSortMeta);

        return { recent: byRecent, top: byTop };
    }

    function mapSnapshotScore(rawScore, profile) {
        if (!rawScore || typeof rawScore !== 'object') return null;

        const rpValue = Number(
            rawScore.awarded_sp
            ?? rawScore.rp
            ?? rawScore.score
            ?? rawScore.performance
            ?? 0
        );

        const createdAt = rawScore.created_at
            ?? rawScore.playedAt
            ?? rawScore.timestamp
            ?? rawScore.date
            ?? profile?.scores?.updatedAt
            ?? null;

        const mapped = {
            username: rawScore.username
                ?? profile?.displayName
                ?? profile?.name
                ?? 'Unknown',
            beatmap_title: rawScore.beatmap_title
                ?? rawScore.mapTitle
                ?? rawScore.title
                ?? 'Unknown',
            beatmap_image_url: rawScore.beatmap_image_url
                ?? rawScore.coverUrl
                ?? rawScore.image
                ?? rawScore.thumbnail
                ?? null,
            awarded_sp: Number.isFinite(rpValue) ? rpValue : null,
            misses: rawScore.misses ?? rawScore.miss_count ?? rawScore.missCount ?? '?',
            created_at: createdAt,
            _sortRp: Number.isFinite(rpValue) ? rpValue : 0,
            _sortTime: parseTime(createdAt)
        };

        return mapped;
    }

    function parseTime(value) {
        if (!value) return 0;
        const time = new Date(value).getTime();
        return Number.isFinite(time) ? time : 0;
    }

    function stripSortMeta(score) {
        const cleaned = { ...score };
        delete cleaned._sortRp;
        delete cleaned._sortTime;
        return cleaned;
    }

    function escapeHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // Recent scores
    if (recent.length) {
        const recentList = document.querySelector('.recent-list');
        if (recentList) {
            recentList.innerHTML = '';
            recent.forEach(s => recentList.appendChild(buildCard(s, { top: false })));
        }
    }

    // Top scores
    if (top.length) {
        const topList = document.querySelector('.top-scores-list');
        if (topList) {
            topList.innerHTML = '';
            top.forEach((s, i) => {
                const li = document.createElement('li');
                li.className = 'top-score-item';
                li.appendChild(buildCard(s, { top: true, medal: medals[i] ?? `#${i + 1}`, accent: i === 0 }));
                topList.appendChild(li);
            });
        }
    }
})();
