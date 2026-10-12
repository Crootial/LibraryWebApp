// CI pipeline for MyGameVault. Everything runs in Docker, so the Jenkins machine only needs
// Docker and the JUnit plugin (part of Jenkins' suggested plugins). No Node.js install is needed.
//
// Stages: Checkout -> Build test image -> Lint -> Test -> Build app image
//
// The Test stage runs the cases from the test plan (search, make a user, log in, add a game,
// forum comment). A case marked "PASSED" must succeed. A case marked "FAILURE" must be refused by
// the app, so it is a green test when the app says no.

// Jenkins on Linux (or in a container) runs sh, Jenkins on Windows runs bat
def docker(String command, boolean returnStatus = false) {
    return isUnix() ? sh(script: command, returnStatus: returnStatus) : bat(script: command, returnStatus: returnStatus)
}

pipeline {
    agent any

    options {
        timestamps()
        timeout(time: 20, unit: 'MINUTES')
        disableConcurrentBuilds()
        buildDiscarder(logRotator(numToKeepStr: '15'))
    }

    environment {
        APP_IMAGE      = 'librarywebapp'
        TEST_IMAGE     = "librarywebapp-test:${env.BUILD_NUMBER}"
        TEST_CONTAINER = "librarywebapp-test-${env.BUILD_NUMBER}"
    }

    stages {
        stage('Checkout') {
            steps {
                checkout scm
            }
        }

        stage('Build test image') {
            steps {
                script {
                    docker("docker build --target test -t ${env.TEST_IMAGE} .")
                }
            }
        }

        stage('Lint') {
            steps {
                script {
                    docker("docker run --rm ${env.TEST_IMAGE} npm run lint")
                }
            }
        }

        stage('Test') {
            steps {
                script {
                    // Start from an empty results folder so an old report is never mistaken for this run's
                    if (fileExists('test-results')) {
                        dir('test-results') { deleteDir() }
                    }
                    docker("docker rm -f ${env.TEST_CONTAINER}", true)

                    // No --rm and no bind mount: the report is copied out afterwards. That works the same
                    // whether Jenkins runs on the host or inside its own container.
                    int status = docker("docker run --name ${env.TEST_CONTAINER} ${env.TEST_IMAGE}", true)
                    docker("docker cp ${env.TEST_CONTAINER}:/app/test-results .", true)
                    docker("docker rm -f ${env.TEST_CONTAINER}", true)

                    if (status != 0) {
                        error("Tests failed (exit code ${status}). See the test report for the failing case.")
                    }
                }
            }
            post {
                always {
                    junit testResults: 'test-results/junit.xml', allowEmptyResults: false
                    archiveArtifacts artifacts: 'test-results/junit.xml', allowEmptyArchive: true
                }
            }
        }

        stage('Build app image') {
            steps {
                script {
                    docker("docker build --target runtime -t ${env.APP_IMAGE}:${env.BUILD_NUMBER} -t ${env.APP_IMAGE}:latest .")
                }
            }
        }
    }

    post {
        always {
            script {
                docker("docker rm -f ${env.TEST_CONTAINER}", true)
                docker("docker rmi -f ${env.TEST_IMAGE}", true)
            }
        }
        success {
            echo "All test cases behaved as the test plan says. Image ${env.APP_IMAGE}:${env.BUILD_NUMBER} is built."
        }
        failure {
            echo 'A test case did not behave as the test plan says. Open the Test Result page of this build.'
        }
    }
}
