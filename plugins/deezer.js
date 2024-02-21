const Plugger = require("pluggers").default;
const plugin = new Plugger("ms-deezer");
const deezerjs = require("deezer-js");


const deezer_client = new deezerjs.Deezer();

var DEEZER_CLIENTID = process.env.DEEZER_CLIENTID;
var DEEZER_CLIENTSECRET = process.env.DEEZER_CLIENTSECRET;

plugin.pluginConfig = {
    "cool_name": "Deezer",
    "redirect_uri": "http://localhost:3000/deezer_callback",
};

var isLogged = false;

plugin.pluginCallbacks.init = () => {
    const test = "Deezer plugin initialized!";
    return test;
};

async function search(query) {
    const response = await fetch(`https://api.deezer.com/search?q=${query}`);
    const data = await response.json();
    return data;
}

async function login() {
    return true; 
}


plugin.pluginCallbacks.search = (query) => {
    return search(query);
};


plugin.pluginCallbacks.get_playlist_tracks = (playlist_id) => deezer_client.api.get_playlist_tracks(playlist_id);

plugin.pluginCallbacks.add_playlist_track = (playlist_id, track_id) => {return true};

plugin.pluginCallbacks.remove_playlist_track = (playlist_id, track_id) => {return true};

plugin.pluginCallbacks.login = () => login();

plugin.metadata.isLogged = () => isLogged; 



module.exports = plugin;