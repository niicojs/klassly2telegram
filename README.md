## Without docker

- install git and nodejs (tested on v16 and v18)
- `git clone https://github.com/niicojs/klassly2telegram` 
- `npm i`
- copy `config.example.toml` into `config.toml` and set your config
- launch it

## With docker

`docker run -d -v /path/to/config/folder:/data niico:klassly2telegram`

