# XXE via unsafe XML parsing
# Expected: xxe at lines 6, 12

from lxml import etree
import xml.etree.ElementTree as ET

def parse_xml_lxml(xml_string: str):
    return etree.fromstring(xml_string)  # Line 6: VULNERABLE (XXE enabled by default)

def parse_xml_builtin(xml_string: str):
    return ET.fromstring(xml_string)  # Line 12: VULNERABLE

def parse_from_file(path: str):
    tree = etree.parse(path)  # Line 16: VULNERABLE
    return tree.getroot()
