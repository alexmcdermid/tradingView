#!/usr/bin/env bash
set -euo pipefail

usage() {
  echo "Usage: $0 <resume|pause|wait-running> <service-arn> [service-arn ...]" >&2
}

status_for() {
  local service_arn="$1"
  aws apprunner describe-service \
    --service-arn "${service_arn}" \
    --query "Service.Status" \
    --output text
}

fail_if_terminal() {
  local status="$1"
  local service_arn="$2"

  case "${status}" in
    DELETED|CREATE_FAILED|DELETE_FAILED)
      echo "App Runner service ${service_arn} is in terminal status ${status}" >&2
      exit 1
      ;;
  esac
}

wait_for_status() {
  local service_arn="$1"
  local desired_status="$2"
  local status

  for _ in {1..60}; do
    status="$(status_for "${service_arn}")"
    fail_if_terminal "${status}" "${service_arn}"

    if [[ "${status}" == "${desired_status}" ]]; then
      echo "Service ${service_arn} reached ${desired_status}"
      return 0
    fi

    echo "Service ${service_arn} is ${status}; waiting for ${desired_status}"
    sleep 10
  done

  echo "Timed out waiting for ${service_arn} to reach ${desired_status}" >&2
  exit 1
}

wait_until_stable() {
  local service_arn="$1"
  local status

  for _ in {1..60}; do
    status="$(status_for "${service_arn}")"
    fail_if_terminal "${status}" "${service_arn}"

    if [[ "${status}" != "OPERATION_IN_PROGRESS" ]]; then
      echo "${status}"
      return 0
    fi

    echo "Service ${service_arn} has an operation in progress; waiting" >&2
    sleep 10
  done

  echo "Timed out waiting for ${service_arn} to leave OPERATION_IN_PROGRESS" >&2
  exit 1
}

resume_service() {
  local service_arn="$1"
  local status

  while true; do
    status="$(wait_until_stable "${service_arn}")"

    case "${status}" in
      RUNNING)
        echo "Service ${service_arn} is already RUNNING"
        return 0
        ;;
      PAUSED)
        echo "Resuming service ${service_arn}"
        aws apprunner resume-service --service-arn "${service_arn}" >/dev/null
        wait_for_status "${service_arn}" "RUNNING"
        return 0
        ;;
      *)
        fail_if_terminal "${status}" "${service_arn}"
        echo "Cannot resume ${service_arn} from status ${status}" >&2
        exit 1
        ;;
    esac
  done
}

pause_service() {
  local service_arn="$1"
  local status

  while true; do
    status="$(wait_until_stable "${service_arn}")"

    case "${status}" in
      PAUSED)
        echo "Service ${service_arn} is already PAUSED"
        return 0
        ;;
      RUNNING)
        echo "Pausing service ${service_arn}"
        aws apprunner pause-service --service-arn "${service_arn}" >/dev/null
        wait_for_status "${service_arn}" "PAUSED"
        return 0
        ;;
      *)
        fail_if_terminal "${status}" "${service_arn}"
        echo "Cannot pause ${service_arn} from status ${status}" >&2
        exit 1
        ;;
    esac
  done
}

if [[ $# -lt 2 ]]; then
  usage
  exit 1
fi

command="$1"
shift

for service_arn in "$@"; do
  case "${command}" in
    resume)
      resume_service "${service_arn}"
      ;;
    pause)
      pause_service "${service_arn}"
      ;;
    wait-running)
      wait_for_status "${service_arn}" "RUNNING"
      ;;
    *)
      usage
      exit 1
      ;;
  esac
done
