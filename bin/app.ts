#!/usr/bin/env node
import 'source-map-support/register';
import * as cdk from '@aws-cdk/core';
import {AwsCdkWordpressStack} from '../lib/aws-cdk-wordpress-stack';

const app = new cdk.App();
const env = {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
}
new AwsCdkWordpressStack(app, 'AwsCdkWordpressStack3', {
    env,
});