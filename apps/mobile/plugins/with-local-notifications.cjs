const { withEntitlementsPlist } = require('expo/config-plugins');

// Reminders are scheduled on the device. expo-notifications adds APNs by
// default, but BloxPlox has no remote push service or push-token registration.
// Expo executes entitlement mods in reverse plugin order; keep this plugin first.
module.exports = config => withEntitlementsPlist(config, config => {
  delete config.modResults['aps-environment'];
  return config;
});
