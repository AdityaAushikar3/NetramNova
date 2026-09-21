import argparse
import json
import subprocess
import hashlib
from pathlib import Path

def get_image_paths():
    base_dir = Path("public")
    images = []
    for ext in ["*.jpg", "*.jpeg", "*.png"]:
        images.extend(list((base_dir / "samples").glob(ext)))
        images.extend(list((base_dir / "demo_cases").glob(ext)))
    return sorted(images)

def hash_base64(b64_string):
    if not b64_string:
        return b64_string
    return hashlib.md5(b64_string.encode('utf-8')).hexdigest()

def run_inference(image_path):
    print(f"Running inference on {image_path.name}...")
    # Execute inference_service.py as a subprocess to capture its JSON output
    res = subprocess.run(
        ["python", "ml_pipeline/inference_service.py", "--cli", "--image", str(image_path)],
        capture_output=True, text=True
    )
    if res.returncode != 0:
        print(f"ERROR running {image_path}: {res.stderr}")
        return None
    
    try:
        data = json.loads(res.stdout)
    except json.JSONDecodeError:
        print(f"ERROR parsing JSON for {image_path}:\n{res.stdout}")
        return None

    # Replace huge base64 payloads with a hash
    if "preprocessedImage" in data:
        data["preprocessedImage"] = f"HASH:{hash_base64(data['preprocessedImage'])}"
    if "gradcamOverlay" in data:
        data["gradcamOverlay"] = f"HASH:{hash_base64(data['gradcamOverlay'])}"
    
    return data

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--generate", action="store_true", help="Generate new golden snapshots")
    parser.add_argument("--verify", action="store_true", help="Verify against existing golden snapshots")
    args = parser.parse_args()

    if not args.generate and not args.verify:
        print("Specify --generate or --verify")
        return

    snapshot_dir = Path("ml_pipeline/golden_snapshots")
    snapshot_dir.mkdir(parents=True, exist_ok=True)
    images = get_image_paths()

    if not images:
        print("No images found!")
        return

    if args.generate:
        print(f"Generating snapshots for {len(images)} images...")
        for img in images:
            data = run_inference(img)
            if data is None:
                continue
            out_file = snapshot_dir / f"{img.stem}.json"
            with open(out_file, "w", encoding="utf-8") as f:
                json.dump(data, f, indent=2, ensure_ascii=False)
        print("Golden generation complete.")

    elif args.verify:
        print(f"Verifying snapshots for {len(images)} images...")
        all_passed = True
        for img in images:
            data = run_inference(img)
            if data is None:
                all_passed = False
                continue
            
            snapshot_file = snapshot_dir / f"{img.stem}.json"
            if not snapshot_file.exists():
                print(f"FAIL: Snapshot missing for {img.name}")
                all_passed = False
                continue
                
            with open(snapshot_file, "r", encoding="utf-8") as f:
                golden_data = json.load(f)
                
            if data == golden_data:
                print(f"PASS: {img.name}")
            else:
                print(f"FAIL: {img.name} does not match golden snapshot.")
                # We could print a diff here, but simple equality is fine for now
                all_passed = False
                
        if all_passed:
            print("All golden tests PASSED.")
        else:
            print("Some golden tests FAILED.")
            exit(1)

if __name__ == "__main__":
    main()
