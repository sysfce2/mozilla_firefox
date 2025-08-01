# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
"""
Transform the repackage signing task into an actual task description.
"""

from taskgraph.transforms.base import TransformSequence
from taskgraph.util.dependencies import get_primary_dependency
from taskgraph.util.schema import Schema
from taskgraph.util.taskcluster import get_artifact_path
from voluptuous import Optional

from gecko_taskgraph.transforms.task import task_description_schema
from gecko_taskgraph.util.attributes import copy_attributes_from_dependent_job
from gecko_taskgraph.util.partners import get_partner_config_by_kind
from gecko_taskgraph.util.scriptworker import get_signing_type_per_platform

transforms = TransformSequence()

repackage_signing_description_schema = Schema(
    {
        Optional("label"): str,
        Optional("extra"): object,
        Optional("attributes"): task_description_schema["attributes"],
        Optional("dependencies"): task_description_schema["dependencies"],
        Optional("shipping-product"): task_description_schema["shipping-product"],
        Optional("shipping-phase"): task_description_schema["shipping-phase"],
        Optional("priority"): task_description_schema["priority"],
        Optional("task-from"): task_description_schema["task-from"],
    }
)


@transforms.add
def remove_name(config, jobs):
    for job in jobs:
        if "name" in job:
            del job["name"]
        yield job


transforms.add_validate(repackage_signing_description_schema)


@transforms.add
def make_repackage_signing_description(config, jobs):
    for job in jobs:
        dep_job = get_primary_dependency(config, job)
        assert dep_job

        repack_id = dep_job.task["extra"]["repack_id"]
        attributes = dep_job.attributes
        build_platform = dep_job.attributes.get("build_platform")
        is_shippable = dep_job.attributes.get("shippable")

        # Mac & windows
        label = dep_job.label.replace("repackage-", "repackage-signing-")
        # Linux
        label = label.replace("chunking-dummy-", "repackage-signing-")
        description = (
            "Signing of repackaged artifacts for partner repack id '{repack_id}' for build '"
            "{build_platform}/{build_type}'".format(  # NOQA: E501
                repack_id=repack_id,
                build_platform=attributes.get("build_platform"),
                build_type=attributes.get("build_type"),
            )
        )

        if "linux" in build_platform:
            # we want the repack job, via the dependencies for the the chunking-dummy dep_job
            for dep in dep_job.dependencies.values():
                if dep.startswith("release-partner-repack"):
                    dependencies = {"repack": dep}
                    break
        else:
            # we have a genuine repackage job as our parent
            dependencies = {"repackage": dep_job.label}

        attributes = copy_attributes_from_dependent_job(dep_job)
        attributes["repackage_type"] = "repackage-signing"

        signing_type = get_signing_type_per_platform(
            build_platform, is_shippable, config
        )

        if "win" in build_platform:
            upstream_artifacts = [
                {
                    "taskId": {"task-reference": "<repackage>"},
                    "taskType": "repackage",
                    "paths": [
                        get_artifact_path(dep_job, f"{repack_id}/target.installer.exe"),
                    ],
                    "formats": [
                        "gcp_prod_autograph_authenticode_202412",
                        "gcp_prod_autograph_gpg",
                    ],
                }
            ]

            partner_config = get_partner_config_by_kind(config, config.kind)
            partner, subpartner, _ = repack_id.split("/")
            repack_stub_installer = partner_config[partner][subpartner].get(
                "repack_stub_installer"
            )
            if build_platform.startswith("win32") and repack_stub_installer:
                upstream_artifacts.append(
                    {
                        "taskId": {"task-reference": "<repackage>"},
                        "taskType": "repackage",
                        "paths": [
                            get_artifact_path(
                                dep_job,
                                f"{repack_id}/target.stub-installer.exe",
                            ),
                        ],
                        "formats": [
                            "gcp_prod_autograph_authenticode_202412",
                            "gcp_prod_autograph_gpg",
                        ],
                    }
                )
        elif "mac" in build_platform:
            upstream_artifacts = [
                {
                    "taskId": {"task-reference": "<repackage>"},
                    "taskType": "repackage",
                    "paths": [
                        get_artifact_path(dep_job, f"{repack_id}/target.dmg"),
                    ],
                    "formats": ["gcp_prod_autograph_gpg"],
                }
            ]
        elif "linux" in build_platform:
            upstream_artifacts = [
                {
                    "taskId": {"task-reference": "<repack>"},
                    "taskType": "repackage",
                    "paths": [
                        get_artifact_path(dep_job, f"{repack_id}/target.tar.xz"),
                    ],
                    "formats": ["gcp_prod_autograph_gpg"],
                }
            ]

        task = {
            "label": label,
            "description": description,
            "worker-type": "linux-signing",
            "worker": {
                "implementation": "scriptworker-signing",
                "signing-type": signing_type,
                "upstream-artifacts": upstream_artifacts,
            },
            "dependencies": dependencies,
            "attributes": attributes,
            "run-on-projects": dep_job.attributes.get("run_on_projects"),
            "extra": {
                "repack_id": repack_id,
            },
        }
        # we may have reduced the priority for partner jobs, otherwise task.py will set it
        if job.get("priority"):
            task["priority"] = job["priority"]

        yield task
