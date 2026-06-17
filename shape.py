import sys, json


def shape(v, depth=0, maxd=4):
    pad = "  " * depth
    if isinstance(v, dict):
        for k, val in v.items():
            if isinstance(val, list):
                print(f"{pad}{k}: list[{len(val)}]")
                if val and depth < maxd:
                    shape(val[0], depth + 1, maxd)
            elif isinstance(val, dict):
                print(f"{pad}{k}: dict")
                if depth < maxd:
                    shape(val, depth + 1, maxd)
            else:
                print(f"{pad}{k}: {type(val).__name__} = {repr(val)[:70]}")
    elif isinstance(v, list):
        print(f"{pad}list[{len(v)}]")
        if v and depth < maxd:
            shape(v[0], depth + 1, maxd)
    else:
        print(f"{pad}{type(v).__name__} = {repr(v)[:70]}")


try:
    data = json.load(sys.stdin)
    shape(data)
except Exception as e:
    print(f"PARSE ERROR: {e}")
