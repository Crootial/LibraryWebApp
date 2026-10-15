# Jenkins for trying out the pipeline on one machine.
# It uses the host's Docker (the socket is mounted in docker-compose.yml), so the pipeline's
# docker build and docker run steps start ordinary containers next to this one.
FROM jenkins/jenkins:lts-jdk21

USER root

# Docker CLI and buildx, copied from the official CLI image
COPY --from=docker:cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=docker:cli /usr/local/libexec/docker/cli-plugins/docker-buildx /usr/local/lib/docker/cli-plugins/docker-buildx

# The repository is mounted from the host, so its owner is not the jenkins user
RUN git config --system --add safe.directory '*'

RUN jenkins-plugin-cli --plugins \
    configuration-as-code \
    job-dsl \
    workflow-aggregator \
    pipeline-stage-view \
    git \
    junit \
    timestamper

COPY casc.yaml /usr/share/jenkins/casc.yaml

ENV CASC_JENKINS_CONFIG=/usr/share/jenkins/casc.yaml \
    JAVA_OPTS="-Djenkins.install.runSetupWizard=false -Dhudson.plugins.git.GitSCM.ALLOW_LOCAL_CHECKOUT=true"
