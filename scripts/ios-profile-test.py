import copy
import datetime
import importlib.util
import unittest
from pathlib import Path

spec = importlib.util.spec_from_file_location('profile', Path(__file__).with_name('ios-profile.py'))
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)


class SigningProfileTest(unittest.TestCase):
    def setUp(self):
        self.now = datetime.datetime(2026, 10, 13, tzinfo=datetime.timezone.utc)
        self.profile = dict(TeamIdentifier=['7H234Q95ZH'], Name='BloxPlox App Store',
            UUID='11111111-2222-3333-4444-555555555555',
            ExpirationDate=self.now + datetime.timedelta(days=365), DeveloperCertificates=[b'certificate'],
            Entitlements={'application-identifier': '7H234Q95ZH.com.bloxplox.app',
                          'com.apple.developer.team-identifier': '7H234Q95ZH',
                          'com.apple.developer.applesignin': ['Default'], 'get-task-allow': False})

    def test_app_store_profile(self):
        self.assertEqual(module.validate(self.profile, b'certificate', self.now)['bundleId'], 'com.bloxplox.app')

    def test_rejects_unsafe_signing_material(self):
        changes = [({'TeamIdentifier': ['OTHERTEAM']}, {}),
                   ({}, {'application-identifier': '7H234Q95ZH.io.xube.app'}),
                   ({}, {'application-identifier': '7H234Q95ZH.*'}),
                   ({}, {'com.apple.developer.team-identifier': 'OTHERTEAM'}),
                   ({}, {'get-task-allow': True}),
                   ({}, {'com.apple.developer.applesignin': []}),
                   ({'ProvisionedDevices': ['device']}, {}),
                   ({'ProvisionsAllDevices': True}, {}),
                   ({'ExpirationDate': self.now}, {}),
                   ({'DeveloperCertificates': [b'other']}, {})]
        for root, entitlements in changes:
            with self.subTest(root=root, entitlements=entitlements):
                profile = copy.deepcopy(self.profile)
                profile.update(root)
                profile['Entitlements'].update(entitlements)
                with self.assertRaises(ValueError):
                    module.validate(profile, b'certificate', self.now)


if __name__ == '__main__':
    unittest.main()
