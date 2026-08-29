const express = require("express");

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json());

const LETTERS = "abcdefghijklmnopqrstuvwxyz";

function randomKeyword() {
    let result = "";

    for (let i = 0; i < 2; i++) {
        result += LETTERS[Math.floor(Math.random() * LETTERS.length)];
    }

    return result;
}

async function searchUsers() {
    const keyword = randomKeyword();

    const url =
        `https://users.roblox.com/v1/users/search?keyword=${encodeURIComponent(keyword)}&limit=50`;

    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(`User search failed: ${response.status}`);
    }

    const data = await response.json();

    return data.data || [];
}

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
        throw new Error(`Presence failed: ${response.status}`);
    }

    const data = await response.json();

    return data.userPresences?.[0] || null;
}

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

        return data.data?.[0]?.name || null;

    } catch {
        return null;
    }
}

function getStatus(presence) {
    if (!presence) {
        return {
            status: "offline",
            text: "🔴 Offline"
        };
    }

    switch (presence.userPresenceType) {

        case 1:
            return {
                status: "online",
                text: "🟢 In Roblox Menus"
            };

        case 2:
            return {
                status: "playing",
                text: "🎮 Currently Playing"
            };

        case 3:
            return {
                status: "studio",
                text: "🎮 In Roblox Studio"
            };

        default:
            return {
                status: "offline",
                text: "🔴 Offline"
            };
    }
}

/*
============================================================
HOME
============================================================
*/

app.get("/", (req, res) => {

    res.json({
        success: true,
        service: "Roblox Player Searcher",
        status: "online",
        endpoint: "/random"
    });

});

/*
============================================================
RANDOM PLAYER
============================================================
*/

app.get("/random", async (req, res) => {

    try {

        const users = await searchUsers();

        if (!users.length) {
            return res.status(404).json({
                success: false,
                error: "No users found"
            });
        }

        const user =
            users[Math.floor(Math.random() * users.length)];

        const presence =
            await getPresence(user.id);

        const status =
            getStatus(presence);

        let gameName = null;

        if (
            presence &&
            presence.userPresenceType === 2
        ) {
            gameName =
                await getGameName(
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

                status: status.status,

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
============================================================
START
============================================================
*/

app.listen(PORT, () => {

    console.log(
        `Player Searcher API running on port ${PORT}`
    );

});
