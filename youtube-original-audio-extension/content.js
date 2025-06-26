// content.js

/**
 * Logs a message to the console with a prefix.
 * @param {string} message - The message to log.
 * @param {any[]} [optionalParams] - Optional additional parameters to log.
 */
function log(message, ...optionalParams) {
    if (optionalParams.length > 0) {
        console.log(`[YT Original Audio] ${message}`, ...optionalParams);
    } else {
        console.log(`[YT Original Audio] ${message}`);
    }
}

/**
 * Simulates a click on an HTML element.
 * @param {HTMLElement} element - The element to click.
 */
function simulateClick(element) {
    if (element) {
        element.click();
    } else {
        log("Attempted to click a null element.");
    }
}

/**
 * Finds and clicks a menu item based on keywords in its label.
 * Retries a few times for dynamically populated submenus.
 * @param {string[][]} keywordSets - An array of keyword arrays. The script will try to match any of these sets.
 * @param {string} panelSelector - The CSS selector for the panel containing the menu items.
 * @param {number} attempt - Current attempt number for retries.
 * @returns {Promise<HTMLElement|string|null>} The clicked element, 'already_selected', or null if not found/clicked.
 */
async function findAndClickMenuItem(keywordSets, panelSelector, attempt = 0) {
    const primaryKeywordsForLog = keywordSets.map(set => set.join(' & ')).join(' OR ');
    log(`Searching for menu item with keywords: "${primaryKeywordsForLog}" in ${panelSelector} (Attempt ${attempt + 1})`);

    await new Promise(resolve => setTimeout(resolve, 350 + attempt * 250));

    const menuItems = document.querySelectorAll(panelSelector);
    if (menuItems.length === 0 && attempt < 4) {
        log(`No menu items found in ${panelSelector}. Retrying...`);
        return findAndClickMenuItem(keywordSets, panelSelector, attempt + 1);
    }

    let foundAndClickedItem = null;
    for (const item of menuItems) {
        const labelElement = item.querySelector('.ytp-menuitem-label');
        if (labelElement) {
            const labelText = labelElement.textContent.toLowerCase().trim();
            for (const keywords of keywordSets) {
                if (keywords.every(keyword => labelText.includes(keyword.toLowerCase()))) {
                    log(`Found menu item: "${labelElement.textContent}" matching keywords: "${keywords.join(', ')}"`);
                    if ((keywords.includes('(original)') || keywords.includes('original')) && item.getAttribute('aria-checked') === 'true') {
                        log("An original audio track matching keywords is already selected.");
                        return 'already_selected';
                    }
                    simulateClick(item);
                    foundAndClickedItem = item;
                    break;
                }
            }
            if (foundAndClickedItem) break;
        }
    }

    if (foundAndClickedItem) {
        return foundAndClickedItem;
    }

    if (attempt >= 4 && (keywordSets.flat().includes('(original)') || keywordSets.flat().includes('original'))) {
        log(`Menu item with keywords "${primaryKeywordsForLog}" not found after all attempts in ${panelSelector}.`);
        const availableLabels = Array.from(menuItems)
            .map(item => item.querySelector('.ytp-menuitem-label')?.textContent.trim())
            .filter(Boolean);
        if (availableLabels.length > 0) {
            log("Available audio track labels in this panel:", availableLabels);
        } else {
            log("No audio track labels found in this panel to list.");
        }
    } else if (attempt < 4) {
        log(`Retrying findAndClickMenuItem for "${primaryKeywordsForLog}" (attempt ${attempt + 1})`);
        return findAndClickMenuItem(keywordSets, panelSelector, attempt + 1);
    }
    return null;
}

/**
 * Main function to process the video and attempt to set the original audio track.
 * @returns {Promise<boolean>} True if processing is considered complete for this instance (success, already done, or definitive failure for main content),
 * False if processing should be deferred (e.g., ad playing).
 */
async function processVideo() {
    log("Processing video...");

    const settingsButton = document.querySelector('button.ytp-settings-button');
    if (!settingsButton) {
        log("Settings button not found.");
        return false; // Defer, button might appear later
    }

    // Ad check: YouTube often adds 'ad-showing' or 'ad-interrupting' to the player
    const moviePlayer = document.getElementById('movie_player');
    if (moviePlayer && (moviePlayer.classList.contains('ad-showing') || moviePlayer.classList.contains('ad-interrupting'))) {
        log("Ad is currently playing. Deferring audio track change.");
        // If the button was somehow flagged from a previous incorrect attempt during an ad, clear it.
        if(settingsButton.dataset.ytOriginalAudioProcessed === 'true'){
            delete settingsButton.dataset.ytOriginalAudioProcessed;
            log("Cleared premature processed flag due to active ad.");
        }
        return false; // Defer processing
    }

    if (settingsButton.dataset.ytOriginalAudioProcessed === 'true') {
        log("Settings button instance already processed for this video load.");
        return true; // Already processed
    }
    // Set the flag now that we are reasonably sure it's not an ad and we haven't processed this instance.
    settingsButton.dataset.ytOriginalAudioProcessed = 'true';

    simulateClick(settingsButton);
    log("Clicked settings button.");

    const audioTrackMenuItemKeywords = [['audio track'], ['audio']];
    const audioTrackMenuItem = await findAndClickMenuItem(audioTrackMenuItemKeywords, '.ytp-settings-menu .ytp-menuitem');

    if (!audioTrackMenuItem || audioTrackMenuItem === 'already_selected') {
        log("'Audio track' menu item not found or invalid state. Closing settings.");
        simulateClick(settingsButton); // Close settings menu
        return true; // Processing attempt is complete
    }
    log("Clicked 'Audio track' menu item.");

    const originalAudioKeywords = [['(original)'], ['original']];
    const originalAudioResult = await findAndClickMenuItem(originalAudioKeywords, '.ytp-panel-menu .ytp-menuitem');

    if (originalAudioResult === 'already_selected') {
        log("Original audio was already selected. Closing settings.");
    } else if (originalAudioResult) {
        log("Clicked an 'Original' audio track option.");
    } else {
        log("An 'Original' audio track option (matching defined keywords) was not found. Closing settings.");
    }

    await new Promise(resolve => setTimeout(resolve, 500));
    simulateClick(settingsButton);
    log("Closed settings menu.");
    return true; // Processing attempt is complete
}

// Store observer instance so it can be managed if run is called multiple times
let pageObserver = null;

/**
 * Initializes the extension logic for the current page.
 */
function run() {
    if (window.location.pathname !== '/watch') {
        log("Not a watch page. Exiting run.");
        return;
    }
    log("Watch page detected. Initializing or re-initializing observer.");

    // If an old observer exists, disconnect it before creating a new one
    if (pageObserver) {
        pageObserver.disconnect();
        log("Disconnected previous page observer.");
    }

    pageObserver = new MutationObserver((mutations, obs) => {
        const settingsButton = document.querySelector('button.ytp-settings-button');
        // We only need to find the settings button. processVideo will handle ad checks and processed flags.
        if (settingsButton) {
            log("MutationObserver: Settings button detected. Attempting to process video.");
            processVideo().then(isProcessingComplete => {
                if (isProcessingComplete) {
                    log("MutationObserver: processVideo indicated completion or definitive attempt. Disconnecting observer for this page load/navigation.");
                    obs.disconnect(); // Disconnect this specific observer instance
                    pageObserver = null; // Clear the global reference
                } else {
                    log("MutationObserver: processVideo deferred (e.g., ad). Observer remains active.");
                }
            }).catch(error => {
                log("Error during processVideo from MutationObserver:", error);
                // Optionally disconnect observer on error to prevent loops if the error is persistent
                // obs.disconnect();
                // pageObserver = null;
            });
        }
    });

    const playerContainer = document.getElementById('movie_player') || document.body;
    pageObserver.observe(playerContainer, {
        childList: true,
        subtree: true
    });

    // Initial attempt in case elements are already present
    setTimeout(() => {
        const settingsButton = document.querySelector('button.ytp-settings-button');
        if (settingsButton) {
            log("Initial delayed attempt to process video.");
            processVideo().then(isProcessingComplete => {
                // If processing is complete and the observer is still active (it should be unless an error occurred)
                // and it was this initial call that completed it, the observer will disconnect itself.
                if (isProcessingComplete && pageObserver) {
                     log("Initial delayed attempt: processVideo indicated completion. Observer will handle its disconnection if it hasn't already.");
                } else if (!isProcessingComplete) {
                    log("Initial delayed attempt: processVideo deferred. Observer remains active.");
                }
            }).catch(error => {
                log("Error during initial delayed processVideo:", error);
            });
        } else {
            log("Initial delayed check: Settings button still not found.");
        }
    }, 2800);
}

log("Content script loaded.");

document.body.addEventListener('yt-navigate-finish', () => {
    log("yt-navigate-finish event detected. Re-initializing for new video page.");
    // Clear the processed flag from any settings button that might exist from the previous page.
    const oldSettingsButton = document.querySelector('button.ytp-settings-button[data-yt-original-audio-processed="true"]');
    if (oldSettingsButton) {
        delete oldSettingsButton.dataset.ytOriginalAudioProcessed;
        log("Cleared processing flag from potentially old settings button on navigation.");
    }
    setTimeout(run, 1800); // Re-initialize with a delay for the new page
});

// Initial run for the first page load
setTimeout(run, 1800);
