#!/usr/bin/python3

import os, os.path, re, zipfile, json, subprocess

def get_files_to_zip():
	#Exclude git stuff, build scripts etc.
	exclude = [
		r'\.(py|sh|pem)$', #file endings
		r'(\\|/)\.', #hidden files
		r'package(-lock)?\.json|icon\.html', #file names
		r'(\\|/)(promo|unittest|build|node_modules)(\\|/)' #folders
	]

	zippable_files = []
	for root, folders, files in os.walk('.'):
		print(root)
		for f in files:
			file = os.path.join(root,f)
			if not any(re.search(p, file) for p in exclude):
				zippable_files.append(file)
	return zippable_files


def create_addon(files, browser):
	output_folder = 'build'
	if not os.path.isdir(output_folder):
		os.mkdir(output_folder)

	if browser == 'firefox':
		ext = 'xpi'
	else:
		ext = 'zip'

	output_file = os.path.join(output_folder, f'redirector-{browser}.{ext}')
	cert = 'extension-certificate.pem'

	print('')
	print(f'**** Creating addon for {browser} ****')

	if browser == 'opera' and not os.path.exists(cert):
		print('Extension certificate does not exist, creating .zip only (no .nex)')

	with zipfile.ZipFile(output_file, 'w', zipfile.ZIP_STORED) as zf:
		for f in files:
			print('Adding', f)
			if f.endswith('manifest.json'):
				with open(f, encoding='utf-8') as fh:
					manifest = json.load(fh)

				if browser == 'firefox':
					# Firefox MV3 EventPage: uses scripts array, needs webRequestBlocking for blocking listeners
					pass
				else:
					# Chrome/Edge/Opera MV3: service worker background + declarativeNetRequest
					if 'webRequestBlocking' in manifest['permissions']:
						manifest['permissions'].remove('webRequestBlocking')
					del manifest['browser_specific_settings']
					manifest['background'] = {'service_worker': 'js/background.js'}
					manifest['permissions'].append('declarativeNetRequest')

				zf.writestr(f[2:], json.dumps(manifest, indent=2))
			else:
				zf.write(f, f[2:])

	if browser == 'opera' and os.path.exists(cert):
		#Create .nex
		subprocess.run(['bash', 'nex-build.sh', output_file, output_file.replace('.zip', '.nex'), cert], check=False)



if __name__ == '__main__':
	#Make sure we can run this from anywhere
	folder = os.path.dirname(os.path.realpath(__file__))
	os.chdir(folder)

	files = get_files_to_zip()

	print('******* REDIRECTOR BUILD SCRIPT *******')
	print('')

	create_addon(files, 'chrome')
	create_addon(files, 'edge')
	create_addon(files, 'opera')
	create_addon(files, 'firefox')
