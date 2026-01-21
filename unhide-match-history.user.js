// ==UserScript==
// @name         GeoGuessr Unhide Match History
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  Display recent duels widget on GeoGuessr profiles
// @author       Lonanche
// @match        https://www.geoguessr.com/user/*
// @updateURL    https://raw.githubusercontent.com/Lonanche/unhide-match-history/main/unhide-match-history.user.js
// @downloadURL  https://raw.githubusercontent.com/Lonanche/unhide-match-history/main/unhide-match-history.user.js
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    const GAME_MODE_ABBREVIATIONS = {
        'NmpzDuels': 'NMPZ',
        'NoMoveDuels': 'No Move',
        'StandardDuels': 'Moving'
    };

    function extractUserId() {
        const match = window.location.pathname.match(/^\/user\/([^\/]+)/);
        return match ? match[1] : null;
    }

    const CLASS_SELECTORS = [
        ['widgetRoot', 'widget_root__'],
        ['widgetBorder', 'widget_widgetBorder__'],
        ['widgetCompact', 'widget_compact__'],
        ['widgetHeader', 'widget_header__'],
        ['widgetIcon', 'widget_icon__'],
        ['widgetOuter', 'widget_widgetOuter__'],
        ['widgetInner', 'widget_widgetInner__'],
        ['widgetDivider', 'widget_dividerWrapper__'],
        ['widgetHasLoaded', 'widget_hasLoaded__'],
        ['widgetTitle', 'widget_title__'],
        ['widgetRow', 'profile-v2_widgetRow__'],
        ['widgetHeaderContent', 'widget_headerContent__'],
        ['widgetRightSlot', 'widget_rightSlot__'],
        ['headlineHeading', 'headline_heading__'],
        ['headlineBold', 'shared_boldWeight__'],
        ['headlineItalic', 'headline_italic__'],
    ];

    function findClassMapping() {
        const mapping = {};

        for (const [key, pattern] of CLASS_SELECTORS) {
            const el = document.querySelector(`[class*="${pattern}"]`);
            if (!el) continue;

            const matchedClass = el.className.split(' ').find(cls => cls.includes(pattern.replace('__', '_')));
            if (matchedClass) {
                mapping[key] = matchedClass;
            }
        }

        return mapping;
    }

    function waitForWidgetContainer() {
        return new Promise((resolve) => {
            function checkForWidgets() {
                const staticWidgets = document.querySelector('[class*="profile-v2_staticWidgets__"]');
                if (staticWidgets) {
                    resolve(staticWidgets);
                    return true;
                }
                const widgetRow = document.querySelector('[class*="profile-v2_widgetRow__"]');
                if (widgetRow) {
                    resolve(widgetRow.parentElement);
                    return true;
                }
                return false;
            }

            if (checkForWidgets()) return;

            const observer = new MutationObserver(() => {
                if (checkForWidgets()) observer.disconnect();
            });

            observer.observe(document.body, { childList: true, subtree: true });

            setTimeout(() => {
                observer.disconnect();
                resolve(null);
            }, 10000);
        });
    }

    function checkWidgetExists() {
        const hasNativeWidget = Array.from(document.querySelectorAll('h2'))
            .some(h => h.textContent.trim().toLowerCase().includes('recent duels'));
        const hasOurWidget = document.querySelector('#unhide-match-history-widget') !== null;
        return hasNativeWidget || hasOurWidget;
    }

    async function fetchGameHistory(userId) {
        const url = `https://www.geoguessr.com/api/v4/game-history/${userId}?gameMode=None`;
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`API error: ${response.status}`);
        }
        return response.json();
    }

    function buildWidget(data, classes) {
        const entries = data.entries || [];
        const duelEntries = entries.filter(e => e.duel);

        if (duelEntries.length === 0) {
            return null;
        }

        if (!document.getElementById('unhide-match-history-styles')) {
            const style = document.createElement('style');
            style.id = 'unhide-match-history-styles';
            style.textContent = `
                #unhide-match-history-widget {
                    width: 100% !important;
                    min-width: 0 !important;
                    max-width: 100% !important;
                    overflow: hidden !important;
                    contain: inline-size;
                }
                #unhide-match-history-widget * {
                    min-width: 0;
                }
                #unhide-match-history-widget .game-history-list {
                    scrollbar-width: thin;
                    scrollbar-color: rgba(255,255,255,0.2) transparent;
                }
                #unhide-match-history-widget .game-history-list::-webkit-scrollbar {
                    width: 4px;
                }
                #unhide-match-history-widget .game-history-list::-webkit-scrollbar-track {
                    background: transparent;
                }
                #unhide-match-history-widget .game-history-list::-webkit-scrollbar-thumb {
                    background: rgba(255,255,255,0.2);
                    border-radius: 2px;
                }
                .player-link:hover {
                    text-decoration: underline !important;
                    color: #6cb928 !important;
                }
                #unhide-match-history-widget [class*="widget_header"] {
                    padding: 6px 12px !important;
                }
                #unhide-match-history-widget [class*="widgetDivider"] {
                    margin: 0 !important;
                }
                #view-all-duels-btn {
                    background: linear-gradient(135deg, #6cb928 0%, #5da520 100%) !important;
                    color: white !important;
                    border: none !important;
                    border-radius: 20px !important;
                    padding: 7px 16px !important;
                    font-size: 12px !important;
                    font-weight: 600 !important;
                    cursor: pointer !important;
                    transition: all 0.2s !important;
                    box-shadow: 0 2px 8px rgba(108, 185, 40, 0.3) !important;
                }
                #view-all-duels-btn:hover {
                    background: linear-gradient(135deg, #5da520 0%, #4e8f1a 100%) !important;
                    box-shadow: 0 4px 12px rgba(108, 185, 40, 0.4) !important;
                    transform: translateY(-1px) !important;
                }
            `;
            document.head.appendChild(style);
        }

        const widget = document.createElement('div');
        widget.id = 'unhide-match-history-widget';
        widget.className = classes.widgetRow || '';

        const rootClasses = [classes.widgetRoot, classes.widgetCompact].filter(Boolean).join(' ');
        const borderClasses = [classes.widgetBorder, classes.widgetHasLoaded].filter(Boolean).join(' ');
        const headerClasses = [classes.widgetHeader, classes.widgetCompact].filter(Boolean).join(' ');

        const previewEntries = duelEntries.slice(0, 1);
        const headingClasses = [classes.headlineHeading, classes.headlineBold, classes.headlineItalic].filter(Boolean).join(' ');

        widget.innerHTML = `
            <div class="${rootClasses}">
                <div class="${borderClasses}">
                    <div class="${classes.widgetOuter || ''}">
                        <div class="${classes.widgetInner || ''}">
                            <div class="${headerClasses}">
                                <div class="${classes.widgetTitle || ''}">
                                    <div class="${classes.widgetHeader || ''}">
                                        <img alt="recent duels" loading="lazy" width="224" height="230" decoding="async" data-nimg="1" class="${classes.widgetIcon || ''}" style="color: transparent;" srcset="https://www.geoguessr.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=256&q=75 1x, https://www.geoguessr.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=640&q=75 2x" src="https://www.geoguessr.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=640&q=75">
                                        <div class="${classes.widgetHeaderContent || ''}">
                                            <h2 style="--fs:var(--font-size-16);--lh:var(--line-height-16)" class="${headingClasses}">Recent duels</h2>
                                        </div>
                                    </div>
                                </div>
                                <div class="${classes.widgetRightSlot || ''}">
                                    <button type="button" id="view-all-duels-btn">View all</button>
                                </div>
                            </div>
                            <div class="${classes.widgetDivider || ''}"></div>
                            <div class="game-history-list" style="display: flex; flex-direction: column; gap: 8px; padding: 8px;">
                                ${previewEntries.map((entry, index) => buildGameCard(entry, classes, index)).join('')}
                            </div>
            </div>
        </div>
    </div>
</div>
        `;

        widget.querySelector('#view-all-duels-btn')?.addEventListener('click', () => {
            showAllDuelsModal(duelEntries, classes);
        });

        return widget;
    }

    function formatGameMode(gameMode) {
        return GAME_MODE_ABBREVIATIONS[gameMode] || gameMode.replace(/([A-Z])/g, ' $1').trim().toUpperCase();
    }

    function buildPlayerDataMap(teams) {
        const map = {};
        for (const team of teams || []) {
            for (const p of team.players || []) {
                map[p.playerId] = { rating: p.rankedSystemRating, tier: p.tier };
            }
        }
        return map;
    }

    function buildGameCard(entry, classes, index) {
        const { gameId, players, duel } = entry;
        const currentUserId = extractUserId();
        const winnerId = duel?.winnerId;
        const gameMode = duel?.gameMode || 'Duels';

        const playerDataMap = buildPlayerDataMap(duel?.teams);

        const enrichedPlayers = players.map(p => ({
            ...p,
            isWinner: p.id === winnerId,
            rating: playerDataMap[p.id]?.rating || p.rating,
            tier: playerDataMap[p.id]?.tier || p.tier
        }));

        const [leftPlayer, rightPlayer] = enrichedPlayers[0]?.id === currentUserId
            ? enrichedPlayers
            : [enrichedPlayers[1], enrichedPlayers[0]];
        const primaryUserWon = leftPlayer?.isWinner;
        const gameModeDisplay = formatGameMode(gameMode);

        const cardBg = primaryUserWon
            ? 'linear-gradient(135deg, rgba(108,185,40,0.25) 0%, rgba(108,185,40,0.1) 100%)'
            : 'linear-gradient(135deg, rgba(196,36,36,0.25) 0%, rgba(196,36,36,0.1) 100%)';
        const cardBorder = primaryUserWon
            ? '2px solid rgba(108,185,40,0.5)'
            : '2px solid rgba(196,36,36,0.5)';

        return `
            <div style="background: ${cardBg}; border: ${cardBorder}; border-radius: 8px; padding: 16px 20px; display: flex; align-items: center; position: relative;">
                <div style="position: absolute; right: 20px; display: flex; flex-direction: column; gap: 6px;">
                    <a href="https://www.geoguessr.com/duels/${gameId}/replay" title="Replay" style="width: 28px; height: 28px; background: rgba(255,255,255,0.08); border-radius: 4px; display: flex; align-items: center; justify-content: center; text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2">
                            <polygon points="5 3 19 12 5 21 5 3"></polygon>
                        </svg>
                    </a>
                    <a href="https://www.geoguessr.com/duels/${gameId}/summary" title="Summary" style="width: 28px; height: 28px; background: rgba(255,255,255,0.08); border-radius: 4px; display: flex; align-items: center; justify-content: center; text-decoration: none;">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(255,255,255,0.6)" stroke-width="2">
                            <line x1="8" y1="6" x2="21" y2="6"></line>
                            <line x1="8" y1="12" x2="21" y2="12"></line>
                            <line x1="8" y1="18" x2="21" y2="18"></line>
                            <line x1="3" y1="6" x2="3.01" y2="6"></line>
                            <line x1="3" y1="12" x2="3.01" y2="12"></line>
                            <line x1="3" y1="18" x2="3.01" y2="18"></line>
                        </svg>
                    </a>
                </div>
                <div style="display: flex; align-items: center; gap: 16px; margin: 0 auto; padding-right: 60px;">
                    ${buildPlayerColumn(leftPlayer, 'left')}
                    ${buildAvatarCell(leftPlayer)}
                    <div style="display: flex; flex-direction: column; align-items: center; gap: 4px; min-width: 50px;">
                        <span style="font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); letter-spacing: 0.5px;">${gameModeDisplay}</span>
                        <span style="font-size: 14px; font-weight: 700; color: rgba(255,255,255,0.4);">VS</span>
                    </div>
                    ${buildAvatarCell(rightPlayer)}
                    ${buildPlayerColumn(rightPlayer, 'right')}
                </div>
            </div>
        `;
    }

    function buildPlayerColumn(player, side) {
        if (!player) return '';
        const { nick, countryCode, rating, isWinner, id } = player;
        const flagUrl = countryCode ? `https://flagcdn.com/w40/${countryCode.toLowerCase()}.png` : '';
        const resultText = isWinner ? 'VICTORY!' : 'DEFEAT!';
        const resultColor = isWinner ? '#6cb928' : '#c42424';
        const align = side === 'left' ? 'flex-end' : 'flex-start';

        return `
            <div style="display: flex; flex-direction: column; align-items: ${align}; gap: 4px; min-width: 90px;">
                <span style="font-size: 11px; font-weight: 700; color: ${resultColor}; letter-spacing: 0.5px;">${resultText}</span>
                <div style="display: flex; align-items: center; gap: 4px; ${side === 'left' ? 'flex-direction: row-reverse;' : ''}">
                    <a href="/user/${id}" class="player-link" style="font-size: 14px; font-weight: 600; color: white; text-decoration: none; max-width: 80px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">${nick || 'Unknown'}</a>
                    ${flagUrl ? `<img src="${flagUrl}" alt="${countryCode}" style="width: 21px; height: 15px; border-radius: 2px;">` : ''}
                </div>
                <div style="font-size: 11px; color: rgba(255,255,255,0.5);">
                    <span style="color: rgba(255,255,255,0.4);">Rating</span> ${rating || '—'}
                </div>
            </div>
        `;
    }

    function buildAvatarCell(player) {
        if (!player) return '';
        const { nick, pin, tier } = player;
        const avatarUrl = pin?.url
            ? `https://www.geoguessr.com/images/resize:auto:48:48/gravity:ce/plain/${pin.url}`
            : '';
        const tierUrl = `/static/avatars/tiers/low-quality/tier-${tier || 100}.webp`;

        return `
            <div style="position: relative; width: 52px; height: 52px; flex-shrink: 0;">
                <div style="position: absolute; inset: 0; display: flex; align-items: center; justify-content: center;">
                    ${avatarUrl ? `<img src="${avatarUrl}" alt="${nick}" style="width: 36px; height: 36px; border-radius: 50%; object-fit: cover;">` : ''}
                </div>
                <img src="${tierUrl}" alt="" style="position: absolute; inset: 0; width: 100%; height: 100%; pointer-events: none;">
            </div>
        `;
    }

    function showAllDuelsModal(duelEntries, classes) {
        document.getElementById('duels-modal-overlay')?.remove();

        const overlay = document.createElement('div');
        overlay.id = 'duels-modal-overlay';
        overlay.style.cssText = `
            position: fixed;
            inset: 0;
            background: rgba(0, 0, 0, 0.85);
            z-index: 9999;
            display: flex;
            align-items: center;
            justify-content: center;
            padding: 20px;
            backdrop-filter: blur(4px);
        `;

        const modal = document.createElement('div');
        modal.style.cssText = `
            background: #1a1a2e;
            border-radius: 12px;
            width: 100%;
            max-width: 700px;
            max-height: 80vh;
            display: flex;
            flex-direction: column;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
            border: 1px solid rgba(255, 255, 255, 0.1);
        `;

        modal.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.1);">
                <div style="display: flex; align-items: center; gap: 8px;">
                    <img alt="duels" loading="lazy" width="20" height="20" src="https://www.geoguessr.com/_next/image?url=%2F_next%2Fstatic%2Fmedia%2Fgamemode-recent.322c02eb.webp&w=256&q=75" style="width: 20px; height: 20px;">
                    <span style="font-size: 16px; font-weight: 600; color: white;">All Recent Duels</span>
                    <span style="font-size: 12px; color: rgba(255,255,255,0.4);">(${duelEntries.length})</span>
                </div>
                <button id="close-duels-modal" style="background: none; border: none; color: rgba(255,255,255,0.6); cursor: pointer; padding: 4px; display: flex; align-items: center; justify-content: center;">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>
            </div>
            <div class="game-history-list" style="flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px;">
                ${duelEntries.map((entry, index) => buildGameCard(entry, classes, index)).join('')}
            </div>
        `;

        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        function closeModal() {
            overlay.remove();
            document.removeEventListener('keydown', handleEscape);
        }

        function handleEscape(e) {
            if (e.key === 'Escape') closeModal();
        }

        modal.querySelector('#close-duels-modal').addEventListener('click', closeModal);
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) closeModal();
        });
        document.addEventListener('keydown', handleEscape);
    }

    async function main() {
        const userId = extractUserId();
        if (!userId) return;

        const container = await waitForWidgetContainer();
        if (!container || checkWidgetExists()) return;

        const data = await fetchGameHistory(userId).catch(() => null);
        if (!data) return;

        const classes = findClassMapping();
        const widget = buildWidget(data, classes);
        if (!widget) return;

        const firstWidgetRow = container.querySelector('[class*="profile-v2_widgetRow__"]');
        if (firstWidgetRow) {
            firstWidgetRow.after(widget);
        } else {
            container.prepend(widget);
        }
    }

    if (document.readyState === 'complete') {
        main();
    } else {
        window.addEventListener('load', main);
    }

    let lastUrl = location.href;
    new MutationObserver(() => {
        if (location.href !== lastUrl) {
            lastUrl = location.href;
            if (location.pathname.startsWith('/user/')) {
                setTimeout(main, 1000);
            }
        }
    }).observe(document, { subtree: true, childList: true });
})();
