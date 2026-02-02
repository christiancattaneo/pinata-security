# Safe: XML parsing with XXE protection
# Expected: NO detections

from defusedxml import ElementTree as ET
from defusedxml.lxml import parse as safe_parse

def parse_xml_safe(xml_string: str):
    # Safe: using defusedxml
    return ET.fromstring(xml_string)

def parse_from_file_safe(path: str):
    # Safe: using defusedxml.lxml
    return safe_parse(path)
