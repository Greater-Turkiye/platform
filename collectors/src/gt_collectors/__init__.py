"""Greater Türkiye collectors.

Pipeline for every collector run (see collectors/README.md):

    fetch -> parse -> normalize -> SAFETY FILTER -> sign -> post (batches of <= 100)

The Turkish-forces safety filter (:mod:`gt_collectors.safety`) runs in memory right after
parsing, before anything is written to disk or sent over the network.
"""

__version__ = "0.1.0"

USER_AGENT = f"GreaterTurkiyeCollectors/{__version__} (+https://github.com/Greater-Turkiye/platform)"
