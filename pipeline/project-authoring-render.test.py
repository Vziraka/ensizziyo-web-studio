"""Offline renderer integration check: python this-file.py <trusted-runtime.json>.

Uses installed document dependencies, not the Node-only CI environment.
"""
import hashlib
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from PIL import Image
from pypdf import PdfReader

runtime = json.loads(Path(sys.argv.pop(1)).read_text(encoding='utf-8'))
renderer = Path(__file__).with_name('project-authoring-render.py')


class RenderCheck(unittest.TestCase):
    def run_export(self, change=None):
        temporary = tempfile.TemporaryDirectory(prefix='evz-render-check-')
        self.addCleanup(temporary.cleanup)
        root = Path(temporary.name)
        original = root/'original.png'
        Image.new('RGB', (120, 60), '#32865B').save(original)
        digest = hashlib.sha256(original.read_bytes()).hexdigest()
        config = {**runtime, 'fonts': {}, 'images': {'original': {'path': str(original), 'sha256': digest}}}
        source = {'kind': 'website-refinement', 'context_sha256': 'exact-test-context', 'author': 'Offline renderer check', 'pages': [{'title': 'Original placement check', 'width': 1200, 'height': 1600, 'commands': [
            {'op': 'rect', 'x': 0, 'y': 0, 'w': 1200, 'h': 1600, 'color': '#FFFFFF'},
            {'op': 'text', 'x': 50, 'y': 50, 'size': 40, 'text': 'Exact fixture text, searchable.'},
            {'op': 'paragraph', 'x': 50, 'y': 150, 'w': 600, 'text': '<script> is literal source evidence, not executable markup.'},
            {'op': 'line', 'x': 50, 'y': 300, 'x2': 1100, 'y2': 300},
            {'op': 'ellipse', 'x': 50, 'y': 400, 'w': 80, 'h': 80, 'color': '#E0E0E0'},
            {'op': 'image', 'x': 50, 'y': 550, 'w': 600, 'h': 500, 'image_id': 'original'}]}]}
        if change: change(source, config)
        for name, value in [('authored', source), ('runtime', config), ('context', {'source': {'company': {'name': 'STUDIO TEST Renderer'}}})]:
            (root/(name+'.json')).write_text(json.dumps(value), encoding='utf-8')
        result = subprocess.run([sys.executable, str(renderer), str(root), 'source-hash'], capture_output=True, timeout=30)
        self.assertEqual(hashlib.sha256(original.read_bytes()).hexdigest(), digest)
        return root, result

    def test_real_pdf_png_searchable_literal_text_and_original_image(self):
        root, result = self.run_export()
        self.assertEqual(result.returncode, 0, result.stderr.decode())
        receipt = json.loads((root/'export.json').read_text())
        self.assertEqual(len(receipt['pages']), 1)
        self.assertEqual(hashlib.sha256((root/'output.pdf').read_bytes()).hexdigest(), receipt['pdf']['sha256'])
        text = PdfReader(root/'output.pdf').pages[0].extract_text()
        self.assertIn('Exact fixture text, searchable.', text)
        self.assertIn('<script> is literal', text)
        self.assertTrue((root/receipt['pages'][0]['name']).read_bytes().startswith(b'\x89PNG'))
        self.assertTrue(any(r['name'] == 'original.png' for r in receipt['resources']))

    def test_unknown_operations_paths_clipping_and_changed_original_fail_without_receipt(self):
        changes = [
            lambda s, c: s['pages'][0]['commands'].append({'op': '__import__', 'x': 0, 'y': 0}),
            lambda s, c: s['pages'][0]['commands'][-1].update(image_id='../../private'),
            lambda s, c: s['pages'][0]['commands'][1].update(x=1190),
            lambda s, c: c['images']['original'].update(sha256='0'*64)]
        for change in changes:
            with self.subTest(change=change):
                root, result = self.run_export(change)
                self.assertNotEqual(result.returncode, 0)
                self.assertFalse((root/'export.json').exists())


if __name__ == '__main__':
    unittest.main()
