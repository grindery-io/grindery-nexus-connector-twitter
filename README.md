# Twitter Connector for Grindery Nexus


## Development

To test the connector, we can use `npm run local:trigger` command. Example:

```
npm run local:trigger newFollowerTrigger '{"handle":"elonmusk"}'
```

The connector will be run as a WebSocket server after deployment, to test it in production setting, run `npm run server`.

