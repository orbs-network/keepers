# Orbs Keepers

Node service to execute tasks on EVMs given by config

## How to run

The service is packaged as a Docker image. It is routinely published from this repo to [Docker Hub](https://hub.docker.com/repository/docker/orbsnetwork/keepers).
### Tasks JSON config file
```json
{
    "tasks": [
        {
            "name": "revault-update-tvls",
            "active": true,
            "abi": "revault-tvl",
            "networks": [
                "BSC"
            ],
            "addresses": [
                "0xd7550285532f1642511b16Df858546F2593d638B"
            ],
            "send": [
                {
                    "method": "updateAllTvls"
                }
            ],
            "intervalMinutes": 480
        },
        {
            "name": "revault-update-pool",
            "active": true,
            "abi": "revault-pool",
            "networks": [
                "BSC"
            ],
            "addresses": [
                "0xe8f1CDa385A58ae1C1c1b71631dA7Ad6d137d3cb"
            ],
            "send": [
                {
                    "method": "updatePool",
                    "params": [
                        [
                            0
                        ],
                        [
                            1
                        ],
                        [
                            2
                        ],
                        [
                            3
                        ]
                    ]
                }
            ],
            "intervalMinutes": 1440
        }
    ]
}
```
* [Example JSON file](src/tasks.json)

| Field Name | Description |
| ---------- | ----------- |
| `name` | unique name of the task | 
| `active` | ```active=false``` task is not executed |
| `abi` | name of the abi file in abi/ folder |
| `networks` | list of networks to execute this task on |
| `addresses` | list of addresses of deployed contracts |
| `send.method` | name of the method to execute on each of addresses |
| `send.params` | list of list of params, per each, the method is called with corresponding set of params  |

## Environment Variables
| Field Name | Description |
| ---------- | ----------- |
| `PRODUCTION` | 1 means Transaction will be send during keepers task execution |
| `DEBUG` | 1 means ALWAYS_LEADER-=1
| `ALWAYS_LEADER` | 1 means leader election still happens and logged but this node always executes regardless |


### Install dev environment

* Make sure [Node.js](https://nodejs.org/) is installed (min 12.14.0).

  * Install with `brew install node`, check version with `node -v`.

* [VSCode](https://code.visualstudio.com/) is recommended as IDE.

  * Recommended extensions [ESLint](https://marketplace.visualstudio.com/items?itemName=dbaeumer.vscode-eslint), [Prettier - code Formatter](https://marketplace.visualstudio.com/items?itemName=esbenp.prettier-vscode).

* [Docker](https://www.docker.com/) is required for running E2E tests.

  * Install [here](https://docs.docker.com/install/), check version with `docker -v`.

* Run in terminal in root project directory:

  ```
  npm install
  npm test
  ```

## Build

* Run in terminal in root project directory:

  ```
  npm run build:quick
  ```

  > Note that the Python errors `gyp ERR! find Python` on `keccak node-gyp rebuild` are ok.

* Built code will be inside `./dist`.

  * Run it with `npm start`.

* Docker image will be built and tagged as `local/keepers`.

  * Run it with `docker run local/keepers`.

## Test

* For unit tests, run in terminal in root project directory:

  ```
  npm run test
  ```

  To run a single test:

  ```
  npm run test:quick -- src/config.test.ts
  ```

* For E2E tests (on docker), run in terminal in root project directory:

  ```
  npm run build
  npm run test:e2e
  ```

  * Note: running E2E locally may leave docker residues:

    * See which instances are running with `docker ps`, stop all with `docker stop $(docker ps -a -q)`

    * See which images exist with `docker images`, delete all relevant with `docker rmi $(docker images --format '{{.Repository}}:{{.Tag}}' | grep 'cicontainer')`