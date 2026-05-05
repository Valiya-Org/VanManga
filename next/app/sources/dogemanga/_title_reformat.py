"""
Ported verbatim from utils/chapter_title_reformat.py in the original project.
Normalises DogeManga chapter titles to a filesystem-safe format.
"""
import re


def chapter_title_reformat(title: str) -> str:
    pattern = re.compile(r"(s|S)[0-9]+")
    if pattern.search(title):
        while pattern.search(title):
            m = pattern.search(title)
            start = m.span()[0]
            title = title[: start + 1] + "$" + title[start + 1 :]
        return title

    p1 = re.compile(r"第[0-9]+-[0-9]+话")
    p2 = re.compile(r"(v|V)[0-9]+")
    p4 = re.compile(r"[0-9]+")

    if p1.search(title):
        title = title.replace("-", "-第").replace("(", "（").replace(")", "）")
        return title

    if p2.search(title):
        m = p2.search(title)
        start = m.span()[0]
        title = title[: start + 1] + "$" + title[start + 1 :]
        return title.replace("(", "（").replace(")", "）")

    if len(p4.findall(title)) >= 2 and "." not in title:
        title = p4.sub(lambda m: "第" + m.group(), title)
        return title

    return title.replace("-", "$").replace("(", "（").replace(")", "）")
