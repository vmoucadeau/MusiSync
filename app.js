const dotenv = require('dotenv');
dotenv.config();

const Plugger = require("pluggers").default;
const fs = require('fs');
const { get } = require("http");


var sync_playlists = [];
/*
    Playlists Data format:
    [{
        "name": "playlist name",
        "media_services": ["ms-spotify, "ms-deezer"], // List of media services plugins names
        "identifiers" : {
            "ms-spotify" : "playlist_id",
            "ms-deezer" : "playlist_id"
        }
        "tracks" : [
            {
                "identifiers" : {
                    "ms-spotify" : "track_id",
                    "ms-deezer" : "track_id"
                },
                "title" : "track_title",
                "artist" : "track_artist"
            }
        ]
    }]
    Just run the script once to create the file, edit sync_playlists.json to add new playlists (with tracks object empty) then run again the script. 
*/
if(!fs.existsSync("data/")) {
    fs.mkdirSync("data");
}

if(!fs.existsSync("cache/")) {
    fs.mkdirSync("cache");
}

if(fs.existsSync("data/sync_playlists.json")) {
    sync_playlists = JSON.parse(fs.readFileSync('data/sync_playlists.json', 'utf8'));
}
else {
    console.log("Creating playlist file...");
    fs.writeFileSync("data/sync_playlists.json", JSON.stringify(sync_playlists, null, 4));
}

// Create instance
const master = new Plugger("master");

// Add plugins
master.addPlugin(require("./plugins/deezer"));
master.addPlugin(require("./plugins/spotify"));

function contains_track(id, list, service) {
    var i;
    for (const song of list) {
        if (song["identifiers"][service] == id) {
            return true;
        }
    }
    return false;
}

async function searchtrack_id(service, query) {
    const response = await master.getPlugin(service).pluginCallbacks.search(query);
    console.log(response);
    return response;
}


async function get_playlist_tracks(service, playlist_id) {
    const response = await master.getPlugin(service).pluginCallbacks.get_playlist_tracks(playlist_id);
    console.log(response);
    return response;
}

async function do_playlist_sync(playlist_key, deezer_client) {
    var playlist_obj = sync_playlists[playlist_key]
    console_debug("Syncing playlist: " + playlist_obj["name"]);
    
    var playlist_changed = false;
    var playlist_content = {};
    var playlist_musicservices = playlist_obj["media_services"];

    for (const service of playlist_obj["media_services"]) {
        console_debug("Reading playlist from " + service);
        const playlist = await getPlaylist(service, playlist_obj["identifiers"][service]);
        playlist_content[service] = playlist;
    }
    
    for(const new_playlist of playlist_content) {
        console_debug("Checking " + new_playlist + " playlist");
        
        
    }

    


    if(playlist_changed) {
        save_playlists();
    }
}

master.initAll().then(() => {
    get_playlist_tracks("ms-deezer", 908622995);
});
