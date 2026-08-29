const express = require("express");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;

/*
==============================================================
 CONFIG
==============================================================
*/

const SEARCH_LIMIT = 50;

// Random two-letter searches.
// This gives us a changing pool of Roblox users.
const LETTERS = "abcdefghijklmnopqrstuvwxyz";

let recentUsers = new Map();

/*
==============================================================
 HELPERS
==============================================================
*/

function randomLetters(length = 2) {
    let result = "";

    for (let i = 0; i < length; i++) {
        result += LETTERS[
            Math.floor(Math.random() * LETTERS.length)
        ];
    }

    return result;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

/*
==============================================================
 ROBLOX USER SEARCH
==============================================================
*/

async function searchRobloxUsers() {

    const keyword = randomLetters(2);

    const url =
        "https://users.roblox.com/v1/users/search" +
        `?keyword=${encodeURIComponent(keyword)}` +
        `&limit=${SEARCH_LIMIT}`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Roblox user search failed: ${response.status}`
        );
    }

    const data = await response.json();

    return data.data || [];
}

/*
==============================================================
 PRESENCE
==============================================================
*/

async function getPresence(userId) {

    const response = await fetch(
        "https://presence.roblox.com/v1/presence/users",
        {
            method: "POST",

            headers: {
                "Content-Type": "application/json"
            },

            body: JSON.stringify({
                userIds: [userId]
            })
        }
    );

    if (!response.ok) {
        throw new Error(
            `Roblox presence request failed: ${response.status}`
        );
    }

    const data = await response.json();

    return data.userPresences?.[0] || null;
}

/*
==============================================================
 GAME NAME
==============================================================
*/

async function getGameName(universeId) {

    if (!universeId) {
        return null;
    }

    try {

        const response = await fetch(
            `https://games.roblox.com/v1/games?universeIds=${universeId}`
        );

        if (!response.ok) {
            return null;
        }

        const data = await response.json();

        if (
            data.data &&
            data.data.length > 0
        ) {
            return data.data[0].name || null;
        }

    } catch (err) {
        console.log(
            "Game lookup failed:",
            err.message
        );
    }

    return null;
}

/*
==============================================================
 STATUS TRANSLATION
==============================================================

0 = Offline
1 = Online
2 = In Game
3 = In Studio
*/

function getStatus(presence) {

    if (!presence) {

        return {
            code: "offline",
            text: "🔴 Offline"
        };

    }

    switch (presence.userPresenceType) {

        case 2:

            return {
                code: "playing",
                text: "🎮 Currently Playing"
            };

        case 1:

            return {
                code: "online",
                text: "🟢 In Roblox Menus"
            };

        case 3:

            return {
                code: "studio",
                text: "🎮 In Roblox Studio"
            };

        default:

            return {
                code: "offline",
                text: "🔴 Offline"
            };
    }
}

/*
==============================================================
 RANDOM USER
==============================================================
*/

async function getRandomUser() {

    for (let attempt = 0; attempt < 8; attempt++) {

        const users = await searchRobloxUsers();

        if (!users.length) {
            continue;
        }

        // Shuffle
        users.sort(() => Math.random() - 0.5);

        for (const user of users) {

            if (!user || !user.id) {
                continue;
            }

            // Don't repeat very recently shown users.
            if (recentUsers.has(user.id)) {
                continue;
            }

            recentUsers.set(
                user.id,
                Date.now()
            );

            return user;
        }

        await sleep(100);
    }

    return null;
}

/*
==============================================================
 CLEAN OLD CACHE
==============================================================
*/

setInterval(() => {

    const now = Date.now();

    for (const [userId, time] of recentUsers) {

        // Forget users after 10 minutes.
        if (now - time > 10 * 60 * 1000) {
            recentUsers.delete(userId);
        }
    }

}, 60 * 1000);

/*
==============================================================
 API
==============================================================
*/

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "Roblox Player Searcher",
        status: "online"
    });

});

/*
==============================================================
 /random
==============================================================
*/

app.get("/random", async (req, res) => {

    try {

        const user = await getRandomUser();

        if (!user) {

            return res.status(503).json({
                success: false,
                error: "No random user found"
            });

        }

        const presence = await getPresence(user.id);

        const status = getStatus(presence);

        let gameName = null;

        if (
            presence &&
            presence.userPresenceType === 2 &&
            presence.universeId
        ) {

            gameName = await getGameName(
                presence.universeId
            );

        }

        res.json({

            success: true,

            user: {
                id: user.id,
                username: user.name,
                displayName:
                    user.displayName || user.name
            },

            presence: {

                status: status.code,
                text: status.text,

                gameName: gameName,

                universeId:
                    presence?.universeId || null,

                placeId:
                    presence?.placeId || null
            }

        });

    } catch (error) {

        console.error(error);

        res.status(500).json({

            success: false,

            error: error.message
        });

    }

});

/*
==============================================================
 START SERVER
==============================================================
*/

app.listen(PORT, () => {

    console.log(
        `Player Searcher API running on port ${PORT}`
    );

});
