import json
import base64
import io
import openpyxl
from http.server import BaseHTTPRequestHandler
 
class handler(BaseHTTPRequestHandler):
 
    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.end_headers()
 
    def do_POST(self):
        length = int(self.headers.get('Content-Length', 0))
        body = json.loads(self.rfile.read(length))
 
        try:
            file_b64 = body.get('fileBase64')
            values = body.get('values', {})
            target_age = body.get('age')
 
            if not file_b64 or target_age is None:
                self._respond(400, {'error': 'fileBase64 et age requis'})
                return
 
            wb = openpyxl.load_workbook(io.BytesIO(base64.b64decode(file_b64)))
 
            sheet_name = next(
                (n for n in wb.sheetnames if 'fiche' in n.lower() or 'production' in n.lower()),
                wb.sheetnames[0]
            )
            ws = wb[sheet_name]
 
            target_row = None
            for row in ws.iter_rows():
                try:
                    if row[2].value is not None and int(row[2].value) == int(target_age):
                        target_row = row[0].row
                        break
                except (ValueError, TypeError):
                    continue
 
            if target_row is None:
                self._respond(404, {'error': f'Age {target_age} introuvable'})
                return
 
            def sc(col, val):
                if val is not None and val != '' and val != 0:
                    ws[f'{col}{target_row}'] = val
 
            sc('D', values.get('mortalite'))
            sc('G', values.get('effectif_fin'))
            for i, col in enumerate(['H','I','J','K','L','M','N']):
                sc(col, values.get(f'ponte_j{i+1}'))
            sc('P', values.get('ponte_hebdo'))
            sc('W', values.get('declasses'))
            sc('AM', values.get('conso_aliment_kg'))
            sc('AY', values.get('conso_eau_L'))
            if values.get('poids_oeufs'): sc('AB', values['poids_oeufs'])
            if values.get('poids_vif'): sc('AV', values['poids_vif'])
            if values.get('homogeneite'): sc('AW', values['homogeneite'])
            if values.get('observations'): sc('BF', values['observations'])
 
            out = io.BytesIO()
            wb.save(out)
            out.seek(0)
 
            self._respond(200, {
                'fileBase64': base64.b64encode(out.read()).decode(),
                'rowFound': target_row,
                'sheetName': sheet_name
            })
 
        except Exception as e:
            self._respond(500, {'error': str(e)})
 
    def _respond(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
