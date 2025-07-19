from flask import Flask, request, send_from_directory, jsonify
import json
import os

app = Flask(__name__, static_url_path='', static_folder='.')

OUTPUT_PATH = 'assets/output.json'
TAGS_PATH = 'assets/tags.json'
ALIASES_PATH = 'assets/aliases.json'


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
    new_tags = request.get_json(force=True)
    if not new_tags:
        return jsonify({'status': 'fail', 'reason': 'no tag data'}), 400

    if os.path.exists(TAGS_PATH):
        with open(TAGS_PATH, 'r', encoding='utf-8') as f:
            tag_list = json.load(f)
    else:
        tag_list = []

    tag_strings = set(t['string'].strip().lower() for t in tag_list)
    added = []

    def get_next_custom_id(tag_list):
        custom_ids = [int(t['id'][1:]) for t in tag_list if isinstance(t['id'], str) and t['id'].startswith('x')]
        next_id = max(custom_ids) + 1 if custom_ids else 1
        return f'x{next_id}'

    def get_next_int_id(tag_list):
        int_ids = [t['id'] for t in tag_list if isinstance(t['id'], int)]
        next_id = max(int_ids) + 1 if int_ids else 1
        return next_id

    for t in new_tags:
        tag_str = t['string'].strip().lower()
        if tag_str not in tag_strings:
            if t['category'] in ('custom', 'custom vocab'):
                tag_id = get_next_custom_id(tag_list)
            else:
                tag_id = get_next_int_id(tag_list)
            new_entry = {
                "id": tag_id,
                "category": t['category'],
                "string": t['string']
            }
            tag_list.append(new_entry)
            tag_strings.add(tag_str)
            added.append(new_entry)
    with open(TAGS_PATH, 'w', encoding='utf-8') as f:
        json.dump(tag_list, f, indent=2, ensure_ascii=False)
    return jsonify({"status": "success", "added": added})


# ===  Save tags.json ===
@app.route('/save_tags', methods=['POST'])
def save_tags():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({'status': 'fail', 'reason': 'invalid data'}), 400
    try:
        with open(TAGS_PATH, 'w', encoding='utf-8') as f:
            json.dump(data, f, indent=2, ensure_ascii=False)
        return jsonify({'status': 'success'})
    except Exception as e:
        return jsonify({'status': 'fail', 'reason': str(e)}), 500

# === New: Save aliases.json ===
@app.route('/save_aliases', methods=['POST'])
def save_aliases():
    data = request.get_json(force=True)
    if not isinstance(data, list):
        return jsonify({'status': 'fail', 'reason': 'invalid data'}), 400

    # Clean out any extra fields (e.g., _editing)
    cleaned = []
    for item in data:
        cleaned.append({
            "alias": item.get("alias"),
            "id": str(item.get("id"))  # Ensure ID is string for both "x3" and 3
        })

    # Write to aliases.json
    with open(ALIASES_PATH, 'w', encoding='utf-8') as f:
        json.dump(cleaned, f, indent=2, ensure_ascii=False)

    # ---- Now update output.json ----
    changed_count = 0
    if os.path.exists(OUTPUT_PATH):
        with open(OUTPUT_PATH, 'r', encoding='utf-8') as f:
            outputs = json.load(f)
    else:
        outputs = []

    # Load the tags for reference (to get correct string for each tag id)
    if os.path.exists(TAGS_PATH):
        with open(TAGS_PATH, 'r', encoding='utf-8') as f:
            tags = json.load(f)
        # ID as string for matching with alias.id
        tag_lookup = {str(t['id']): t['string'] for t in tags}
    else:
        tag_lookup = {}

    # Build alias map: lowercased alias string → correct tag string (from tags.json)
    alias_map = {a['alias'].strip().lower(): tag_lookup.get(str(a['id']), None) for a in cleaned}

    # Update output.json: replace tags that match any alias
    for entry in outputs:
        if 'Tags' in entry:
            for tagobj in entry['Tags']:
                orig = tagobj['string']
                orig_lc = orig.lower().strip()
                # Handle vocab: tags
                is_vocab = orig_lc.startswith('vocab: ')
                match_str = orig_lc[7:].strip() if is_vocab else orig_lc
                # If this matches an alias, replace with real tag string
                if match_str in alias_map and alias_map[match_str]:
                    newstr = alias_map[match_str]
                    tagobj['string'] = f'vocab: {newstr}' if is_vocab else newstr
                    changed_count += 1

    # Write back only if anything changed
    if changed_count:
        with open(OUTPUT_PATH, 'w', encoding='utf-8') as f:
            json.dump(outputs, f, indent=2, ensure_ascii=False)

    return jsonify({'status': 'success', 'updated_tags': changed_count})






if __name__ == '__main__':
    app.run(port=8000, debug=True)