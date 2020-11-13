#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import {ServerlessWordpressApp} from "../lib/stacks/ServerlessWordpressApp";
import {ElasticContainerService} from "../lib/stacks/ElasticContainerService";
import {ElasticFileSystem} from "../lib/stacks/ElasticFileSystem";
import {ApplicationLoadBalancer} from "../lib/stacks/ApplicationLoadBalancer";

const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
}
const elasticFileSystem = new ElasticFileSystem(app, 'ServerlessWordpressApp-ElasticFileSystem', {env});
const elasticContainerService = new ElasticContainerService(app, 'ServerlessWordpressApp-ElasticContainerService', {
    env,
    fileSystem: elasticFileSystem.fileSystem,
    fileSystemSecurityGroup: elasticFileSystem.securityGroup,
});
const applicationLoadBalancer = new ApplicationLoadBalancer(app, 'ServerlessWordpressApp-ApplicationLoadBalancer', {env});

const serverlessWordpressApp = new ServerlessWordpressApp(app, 'ServerlessWordpressApp', {
    env,
    cluster: elasticContainerService.cluster,
    fileSystem: elasticFileSystem.fileSystem,
    fileSystemSecurityGroup: elasticFileSystem.securityGroup,
    loadBalancer: applicationLoadBalancer.loadBalancer,
});