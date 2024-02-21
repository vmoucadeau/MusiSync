const Plugger = require("pluggers").default;

const plugin = new Plugger("ms-spotify");

plugin.pluginCallbacks.init = () => {
  const test = "Spotify plugin initialized!";
  return test;
};



module.exports = plugin;