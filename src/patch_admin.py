import sys

with open('src/pages/AdminDashboard.jsx', 'r', encoding='utf-8') as f:
    lines = f.readlines()

# Insert accessSubTab state after line 18 (0-indexed: 17)
target_line = "  const [activeTab, setActiveTab] = useState(currentTab && currentTab !== 'admin' ? currentTab : 'forms');\n"
insert_line = "  const [accessSubTab, setAccessSubTab] = useState('rules');\n"

for i, line in enumerate(lines):
    if "const [activeTab, setActiveTab]" in line and "useState" in line:
        lines.insert(i + 1, insert_line)
        print(f"Inserted after line {i+1}")
        break
else:
    print("ERROR: activeTab line not found")
    sys.exit(1)

with open('src/pages/AdminDashboard.jsx', 'w', encoding='utf-8') as f:
    f.writelines(lines)

print("Done. Total lines:", len(lines))
