import json
import base64
import io
import zipfile
import re
import copy
from http.server import BaseHTTPRequestHandler
from xml.etree import ElementTree as ET
 
NSMAP = {
    'main': 'http://schemas.openxmlformats.org/spreadsheetml/2006/main',
    'r': 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
}
 
def col_letter_to_index(col):
    """Convert column letter(s) to 0-based index: A=0, B=1, ..., Z=25, AA=26"""
    result = 0
    for char in col.upper():
        result = result * 26 + (ord(char) - ord('A') + 1)
    return result - 1
 
def cell_ref(col_letter, row_num):
    return f"{col_letter.upper()}{row_num}"
 
def find_shared_string_index(shared_strings_xml, value):
    """Find or add a string in sharedStrings.xml, return index"""
    root = ET.fromstring(shared_strings_xml)
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    items = root.findall(f'{{{ns}}}si')
    str_val = str(value)
    for i, si in enumerate(items):
        t = si.find(f'{{{ns}}}t')
        if t is not None and t.text == str_val:
            return i, shared_strings_xml
    # Add new entry
    new_si = ET.SubElement(root, f'{{{ns}}}si')
    new_t = ET.SubElement(new_si, f'{{{ns}}}t')
    new_t.text = str_val
    root.set('count', str(len(items) + 1))
    root.set('uniqueCount', str(len(items) + 1))
    return len(items), ET.tostring(root, encoding='unicode', xml_declaration=False)
 
def inject_values_into_sheet(sheet_xml, row_num, col_values):
    """
    Inject numeric values into specific cells of a sheet XML.
    col_values: dict of {col_letter: numeric_value}
    Preserves existing cell styles (s attribute).
    """
    # Parse preserving namespaces
    ET.register_namespace('', 'http://schemas.openxmlformats.org/spreadsheetml/2006/main')
    ET.register_namespace('r', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships')
    
    root = ET.fromstring(sheet_xml)
    ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
    
    # Find the target row
    sheet_data = root.find(f'{{{ns}}}sheetData')
    target_row_el = None
    for row_el in sheet_data.findall(f'{{{ns}}}row'):
        if row_el.get('r') == str(row_num):
            target_row_el = row_el
            break
    
    if target_row_el is None:
        return sheet_xml  # Row not found, return unchanged
    
    for col_letter, value in col_values.items():
        if value is None or value == '' or value == 0:
            continue
        
        ref = cell_ref(col_letter, row_num)
        
        # Find existing cell
        target_cell = None
        for cell in target_row_el.findall(f'{{{ns}}}c'):
            if cell.get('r') == ref:
                target_cell = cell
                break
        
        if target_cell is None:
            # Create new cell — insert in correct column order
            target_cell = ET.Element(f'{{{ns}}}c')
            target_cell.set('r', ref)
            col_idx = col_letter_to_index(col_letter)
            inserted = False
            cells = target_row_el.findall(f'{{{ns}}}c')
            for i, cell in enumerate(cells):
                cell_col = re.sub(r'\d', '', cell.get('r', ''))
                if col_letter_to_index(cell_col) > col_idx:
                    target_row_el.insert(list(target_row_el).index(cell), target_cell)
                    inserted = True
                    break
            if not inserted:
                target_row_el.append(target_cell)
        
        # Set numeric value — remove 't' attribute (string type) if present
        if 'r' in target_cell.attrib and target_cell.get('t') == 's':
            del target_cell.attrib['t']
        if target_cell.get('t'):
            del target_cell.attrib['t']
        
        # Set or update <v> element
        v_el = target_cell.find(f'{{{ns}}}v')
        if v_el is None:
            v_el = ET.SubElement(target_cell, f'{{{ns}}}v')
        v_el.text = str(value)
        
        # Remove formula if present
        f_el = target_cell.find(f'{{{ns}}}f')
        if f_el is not None:
            target_cell.remove(f_el)
    
    return ET.tostring(root, encoding='unicode')
 
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
            target_age = int(body.get('age', 0))
 
            if not file_b64 or not target_age:
                self._respond(400, {'error': 'fileBase64 et age requis'})
                return
 
            # Open xlsx as zip
            file_bytes = base64.b64decode(file_b64)
            xlsx_zip = zipfile.ZipFile(io.BytesIO(file_bytes), 'r')
            
            # Find the right sheet
            workbook_xml = xlsx_zip.read('xl/workbook.xml').decode('utf-8')
            wb_root = ET.fromstring(workbook_xml)
            ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
            r_ns = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships'
            
            # Find sheet relationships
            rels_xml = xlsx_zip.read('xl/_rels/workbook.xml.rels').decode('utf-8')
            rels_root = ET.fromstring(rels_xml)
            
            sheet_names = wb_root.findall(f'.//{{{ns}}}sheet')
            target_sheet_path = None
            target_sheet_name = None
            
            for sheet in sheet_names:
                name = sheet.get('name', '')
                rid = sheet.get(f'{{{r_ns}}}id') or sheet.get('r:id')
                if 'fiche' in name.lower() or 'production' in name.lower():
                    for rel in rels_root:
                        if rel.get('Id') == rid:
                            target_sheet_path = 'xl/' + rel.get('Target')
                            target_sheet_name = name
                            break
                    if target_sheet_path:
                        break
            
            if not target_sheet_path:
                # Use first sheet
                sheet = sheet_names[0]
                rid = sheet.get(f'{{{r_ns}}}id') or sheet.get('r:id')
                for rel in rels_root:
                    if rel.get('Id') == rid:
                        target_sheet_path = 'xl/' + rel.get('Target')
                        target_sheet_name = sheet.get('name')
                        break
 
            sheet_xml = xlsx_zip.read(target_sheet_path).decode('utf-8')
            
            # Find target row (where col C = target_age)
            sheet_root = ET.fromstring(sheet_xml)
            sheet_data = sheet_root.find(f'{{{ns}}}sheetData')
            target_row = None
            
            for row_el in sheet_data.findall(f'{{{ns}}}row'):
                row_num = int(row_el.get('r', 0))
                for cell in row_el.findall(f'{{{ns}}}c'):
                    ref = cell.get('r', '')
                    col = re.sub(r'\d', '', ref)
                    if col.upper() == 'C':
                        v = cell.find(f'{{{ns}}}v')
                        if v is not None and v.text:
                            try:
                                if int(float(v.text)) == target_age:
                                    target_row = row_num
                                    break
                            except (ValueError, TypeError):
                                pass
                if target_row:
                    break
            
            if not target_row:
                self._respond(404, {'error': f'Age {target_age} introuvable dans {target_sheet_name}'})
                return
 
            # Build col_values dict
            ponte_cols = ['H','I','J','K','L','M','N']
            col_values = {}
            if values.get('mortalite'): col_values['D'] = values['mortalite']
            if values.get('effectif_fin'): col_values['G'] = values['effectif_fin']
            for i, col in enumerate(ponte_cols):
                v = values.get(f'ponte_j{i+1}')
                if v: col_values[col] = v
            if values.get('ponte_hebdo'): col_values['P'] = values['ponte_hebdo']
            if values.get('declasses'): col_values['W'] = values['declasses']
            if values.get('conso_aliment_kg'): col_values['AM'] = values['conso_aliment_kg']
            if values.get('conso_eau_L'): col_values['AY'] = values['conso_eau_L']
            if values.get('poids_oeufs'): col_values['AB'] = values['poids_oeufs']
            if values.get('poids_vif'): col_values['AV'] = values['poids_vif']
            if values.get('homogeneite'): col_values['AW'] = values['homogeneite']
 
            # Inject into sheet XML
            new_sheet_xml = inject_values_into_sheet(sheet_xml, target_row, col_values)
 
            # Rebuild xlsx zip with modified sheet only
            output = io.BytesIO()
            with zipfile.ZipFile(output, 'w', zipfile.ZIP_DEFLATED) as out_zip:
                for item in xlsx_zip.namelist():
                    if item == target_sheet_path:
                        out_zip.writestr(item, new_sheet_xml.encode('utf-8'))
                    else:
                        out_zip.writestr(item, xlsx_zip.read(item))
            
            output.seek(0)
            result_b64 = base64.b64encode(output.read()).decode()
 
            self._respond(200, {
                'fileBase64': result_b64,
                'rowFound': target_row,
                'sheetName': target_sheet_name
            })
 
        except Exception as e:
            import traceback
            self._respond(500, {'error': str(e), 'trace': traceback.format_exc()})
 
    def _respond(self, status, data):
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Access-Control-Allow-Origin', '*')
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())
