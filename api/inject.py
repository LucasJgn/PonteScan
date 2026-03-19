from flask import Flask, request, jsonify
import json
import base64
import io
import openpyxl
 
app = Flask(__name__)
 
@app.route('/api/inject', methods=['POST', 'OPTIONS'])
def inject():
    if request.method == 'OPTIONS':
        resp = app.make_default_options_response()
        resp.headers['Access-Control-Allow-Origin'] = '*'
        resp.headers['Access-Control-Allow-Headers'] = 'Content-Type'
        return resp
 
    try:
        data = request.get_json()
        file_b64 = data.get('fileBase64')
        values = data.get('values', {})
        target_age = data.get('age')
 
        if not file_b64 or target_age is None:
            return jsonify({'error': 'fileBase64 et age requis'}), 400
 
        file_bytes = base64.b64decode(file_b64)
        wb = openpyxl.load_workbook(io.BytesIO(file_bytes))
 
        sheet_name = None
        for name in wb.sheetnames:
            if 'fiche' in name.lower() or 'production' in name.lower():
                sheet_name = name
                break
        if not sheet_name:
            sheet_name = wb.sheetnames[0]
 
        ws = wb[sheet_name]
 
        target_row = None
        for row in ws.iter_rows():
            cell_c = row[2].value
            if cell_c is not None:
                try:
                    if int(cell_c) == int(target_age):
                        target_row = row[0].row
                        break
                except (ValueError, TypeError):
                    continue
 
        if target_row is None:
            return jsonify({'error': f'Semaine age {target_age} introuvable'}), 404
 
        def set_cell(col, val):
            if val is not None and val != '' and val != 0:
                ws[f'{col}{target_row}'] = val
 
        set_cell('D', values.get('mortalite'))
        set_cell('G', values.get('effectif_fin'))
        for i, col in enumerate(['H','I','J','K','L','M','N']):
            set_cell(col, values.get(f'ponte_j{i+1}'))
        set_cell('P', values.get('ponte_hebdo'))
        set_cell('W', values.get('declasses'))
        set_cell('AM', values.get('conso_aliment_kg'))
        set_cell('AY', values.get('conso_eau_L'))
        if values.get('poids_oeufs'): set_cell('AB', values['poids_oeufs'])
        if values.get('poids_vif'): set_cell('AV', values['poids_vif'])
        if values.get('homogeneite'): set_cell('AW', values['homogeneite'])
        if values.get('observations'): set_cell('BF', values['observations'])
 
        output = io.BytesIO()
        wb.save(output)
        output.seek(0)
        result_b64 = base64.b64encode(output.read()).decode('utf-8')
 
        resp = jsonify({'fileBase64': result_b64, 'rowFound': target_row, 'sheetName': sheet_name})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp
 
    except Exception as e:
        resp = jsonify({'error': str(e)})
        resp.headers['Access-Control-Allow-Origin'] = '*'
        return resp, 500
 
if __name__ == '__main__':
    app.run()
