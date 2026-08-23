"""
Publish training pipeline.

Stages, in order, each runnable on its own so a stage can be re-run without
redoing the ones before it:

    collect   -> ml/data/raw/{channels,videos}.jsonl + raw/thumbs/*.jpg
    thumbs    -> ml/data/raw/thumb_features.jsonl
    labels    -> ml/data/build/dataset.jsonl   (features + channel-relative label)
    train     -> ml/data/model/model.txt
    evaluate  -> ml/data/model/metrics.json
    export    -> ml/data/model/publish-model.json  (read by the TypeScript app)
    recommend -> per-video advice, from the exported model

`features` and `config` hold no state and are imported by everything else.
"""

__version__ = "1.0.0"
