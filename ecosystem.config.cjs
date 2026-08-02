module.exports = {
  apps: [
    {
      name: "revomail",
      script: "server.js",
      cwd: __dirname,
      instances: 1,
      autorestart: true,
      max_memory_restart: "300M",
      time: true
    }
  ]
};
