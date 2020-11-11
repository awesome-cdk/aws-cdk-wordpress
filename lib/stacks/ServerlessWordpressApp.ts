import {Construct, Stack, StackProps} from "@aws-cdk/core";
import * as ecs from "@aws-cdk/aws-ecs";
import {Cluster, Ec2Service, Ec2TaskDefinition, NetworkMode} from "@aws-cdk/aws-ecs";
import * as path from "path";
import {FileSystem} from "@aws-cdk/aws-efs";
import {SecurityGroup} from "@aws-cdk/aws-ec2";

interface Props extends StackProps {
    cluster: Cluster,
    fileSystem: FileSystem,
    fileSystemSecurityGroup: SecurityGroup,
}

export class ServerlessWordpressApp extends Stack {
    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const volumeName = 'wp-content'

        const taskDefinition = new Ec2TaskDefinition(this, 'Ec2TaskDefinition', {
            networkMode: NetworkMode.AWS_VPC,
            family: "wordpress",
        });
        taskDefinition.addVolume({
            name: 'wp-content',
            host: {
                sourcePath: "/mnt/efs/fs1"
            },
        });
        const container = taskDefinition.addContainer('wordpress', {
            memoryLimitMiB: 256,
            image: ecs.ContainerImage.fromAsset(path.resolve(__dirname, './../wordpress')),
            privileged: true,
        });
        container.addPortMappings({
            containerPort: 80,
        });

        container.addMountPoints({
            readOnly: false,
            containerPath: '/var/www/html/wp-content',
            sourceVolume: volumeName,
        });

        const service = new Ec2Service(this, 'WordPress', {
            cluster: props.cluster,
            taskDefinition,
            desiredCount: 2,
            minHealthyPercent: 0,
            securityGroups: [
                // Allow the container to communicate with EFS volume
                props.fileSystemSecurityGroup,
            ]
        });
    }
}