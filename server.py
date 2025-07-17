from flask import Flask, request, send_from_directory, jsonify
import json
import os

app = Flask(__name__, static_url_path='', static_folder='.')

OUTPUT_PATH = 'assets/output.json'
TAGS_PATH = 'assets/tags.json'    # <-- Move here!

@app.route('/')
def index():
    return send_from_directory('.', 'index.html')

@app.route('/<path:path>')
def static_proxy(path):
    return send_from_directory('.', path)

@app.route('/append_output', methods=['POST'])
def append_output():
    new_entry = request.get_json()
    if not new_entry:
        return jsonify({'status': 'fail', 'reason': 'no data'}), 400
    try:
        if os.path.exists(OUTPUT_PATH):
            with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
                output_list = json.load(f)
        else:
            output_list = []
    except Exception as e:
        output_list = []
    output_list.append(new_entry)
    with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
        json.dump(output_list, f, indent=2, ensure_ascii=False)
    return jsonify({'status': 'success'})

@app.route('/append_tags', methods=['POST'])
def append_tags():
    new_tags = request.get_json(force=True)  # expects list of {string:..., category:...}
    if not new_tags:
        return jsonify({'status': 'fail', 'reason': 'no tag data'}), 400
    try:
        if os.path.exists(TAGS_PATH):
            with open(TAGS_PATH, 'r', encoding='utf-8') as f:
                tag_list = json.load(f)
        else:
            tag_list = []
    except Exception as e:
        tag_list = []
    tag_strings = set(t['string'].strip().lower() for t in tag_list)
    added = []
    for t in new_tags:
        tag_str = t['string'].strip().lower()
        if tag_str not in tag_strings:
            new_entry = {
                "id": 0,
                "category": t['category'],
                "string": t['string']
            }
            tag_list.append(new_entry)
            tag_strings.add(tag_str)
            added.append(new_entry)
    with open(TAGS_PATH, 'w', encoding='utf-8') as f:
        json.dump(tag_list, f, indent=2, ensure_ascii=False)
    return jsonify({"status": "success", "added": added})

if __name__ == '__main__':
    app.run(port=8000, debug=True)