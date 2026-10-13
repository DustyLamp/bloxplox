"""Validate BloxPlox distribution profiles before installing signing material."""
import datetime
import hashlib
import json
import plistlib
import re
import sys
from pathlib import Path

TEAM = '7H234Q95ZH'
BUNDLE = 'com.bloxplox.app'


def validate(profile, certificate, now=None):
    now = now or datetime.datetime.now(datetime.timezone.utc)
    expiry = profile['ExpirationDate'].replace(tzinfo=datetime.timezone.utc)
    entitlements = profile['Entitlements']
    if profile.get('TeamIdentifier') != [TEAM]:
        raise ValueError('Wrong Apple team')
    if entitlements.get('application-identifier') != f'{TEAM}.{BUNDLE}':
        raise ValueError('Wrong application identifier')
    if entitlements.get('com.apple.developer.team-identifier') != TEAM:
        raise ValueError('Wrong entitlement team')
    if entitlements.get('com.apple.developer.applesignin') != ['Default']:
        raise ValueError('Sign in with Apple capability is missing')
    if entitlements.get('get-task-allow') is not False:
        raise ValueError('Development profile is not allowed')
    if 'ProvisionedDevices' in profile or profile.get('ProvisionsAllDevices'):
        raise ValueError('An App Store distribution profile is required')
    if expiry <= now + datetime.timedelta(days=1):
        raise ValueError('Signing profile expires within one day')
    if certificate not in profile.get('DeveloperCertificates', []):
        raise ValueError('Certificate does not match provisioning profile')
    if not re.fullmatch(r'[a-fA-F0-9-]{36}', profile['UUID']):
        raise ValueError('Invalid provisioning profile UUID')
    return dict(teamId=TEAM, bundleId=BUNDLE, uuid=profile['UUID'], name=profile['Name'],
                expiresAt=expiry.isoformat(), certificateSha1=hashlib.sha1(certificate).hexdigest().upper())


if __name__ == '__main__':
    profile = plistlib.loads(Path(sys.argv[1]).read_bytes())
    result = validate(profile, Path(sys.argv[2]).read_bytes())
    output = Path(sys.argv[3])
    output.write_text(json.dumps(result, indent=2) + '\n')
    export = dict(method='app-store-connect', destination='export', teamID=TEAM,
                  signingStyle='manual', signingCertificate=result['certificateSha1'],
                  provisioningProfiles={BUNDLE: result['uuid']},
                  manageAppVersionAndBuildNumber=False, uploadSymbols=True)
    output.with_suffix('.plist').write_bytes(plistlib.dumps(export))
    print('Validated BloxPlox App Store profile, expires ' + result['expiresAt'])
