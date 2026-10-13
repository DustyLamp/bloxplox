// Apply manual signing to the application target only, leaving CocoaPods alone.
import { readFileSync, writeFileSync } from 'node:fs';
import xcode from 'xcode';

const signing = JSON.parse(readFileSync(process.env.BLOXPLOX_IOS_SIGNING_METADATA, 'utf8'));
if (signing.teamId !== '7H234Q95ZH' || signing.bundleId !== 'com.bloxplox.app'
  || !/^[A-F0-9]{40}$/.test(signing.certificateSha1) || !/^[A-Fa-f0-9-]{36}$/.test(signing.uuid)) {
  throw new Error('Unexpected iOS signing identity');
}
const path = 'apps/mobile/ios/BloxPlox.xcodeproj/project.pbxproj';
const project = xcode.project(path).parseSync();
const objects = project.hash.project.objects;
const targets = Object.values(objects.PBXNativeTarget).filter(target => typeof target === 'object'
  && target.productType?.replaceAll('"', '') === 'com.apple.product-type.application');
if (targets.length !== 1 || targets[0].name.replaceAll('"', '') !== 'BloxPlox') throw new Error('Unexpected iOS targets');
let updated = 0;
for (const configuration of objects.XCConfigurationList[targets[0].buildConfigurationList].buildConfigurations) {
  const config = objects.XCBuildConfiguration[configuration.value];
  if (config.name !== 'Release') continue;
  Object.assign(config.buildSettings, {
    DEVELOPMENT_TEAM: signing.teamId,
    CODE_SIGN_STYLE: 'Manual',
    CODE_SIGN_IDENTITY: `"${signing.certificateSha1}"`,
    PROVISIONING_PROFILE_SPECIFIER: `"${signing.uuid}"`,
  });
  updated++;
}
if (updated !== 1) throw new Error('Release configuration missing');
const targetId = Object.entries(objects.PBXNativeTarget).find(([, target]) => target === targets[0])[0];
for (const project of Object.values(objects.PBXProject)) {
  if (typeof project !== 'object') continue;
  project.attributes.TargetAttributes ??= {};
  project.attributes.TargetAttributes[targetId] ??= {};
  Object.assign(project.attributes.TargetAttributes[targetId], { DevelopmentTeam: signing.teamId, ProvisioningStyle: 'Manual' });
}
writeFileSync(path, project.writeSync());
console.log('Manual distribution signing configured for BloxPlox Release.');
