import {Construct, Duration, Stack, StackProps} from "@aws-cdk/core";
import {InstanceType, Port, SecurityGroup, Vpc} from "@aws-cdk/aws-ec2";
import {AutoScalingGroup} from "@aws-cdk/aws-autoscaling";
import {Cluster} from "@aws-cdk/aws-ecs";
import {FileSystem} from "@aws-cdk/aws-efs";
import {ManagedPolicy} from "@aws-cdk/aws-iam";

interface Props extends StackProps {
    fileSystem: FileSystem,
    fileSystemSecurityGroup: SecurityGroup,
}

export class ElasticContainerService extends Stack {
    public cluster: Cluster;
    public spotFleet: AutoScalingGroup;

    constructor(scope: Construct, id: string, props: Props) {
        super(scope, id, props);

        const vpc = Vpc.fromLookup(this, 'vpc', {
            isDefault: true,
        })

        const securityGroup = new SecurityGroup(this, 'SecurityGroup', {
            allowAllOutbound: true,
            vpc,
        });
        securityGroup.addIngressRule(securityGroup, Port.allTraffic());
        // @TODO Restrict access when the whole thing is working
        securityGroup.connections.allowFromAnyIpv4(Port.allTraffic());

        // Create an ElasticContainerService cluster
        this.cluster = new Cluster(this, 'Cluster', {
            vpc,
        });
        this.spotFleet = this.cluster.addCapacity('AsgSpot', {
            maxCapacity: 10,
            minCapacity: 5,
            instanceType: new InstanceType('t3a.nano'),
            spotPrice: '0.0046',
            spotInstanceDraining: true,
            cooldown: Duration.seconds(120),
            taskDrainTime: Duration.seconds(30),
        });

        // Allow Systems Manager connections (e.g. for debugging)
        this.spotFleet.role.addManagedPolicy(ManagedPolicy.fromAwsManagedPolicyName('AmazonSSMManagedInstanceCore'))

        // Wait for EFS to be created before the EC2 instances are created
        this.spotFleet.node.addDependency(props.fileSystem);

        // Allow the Security Group to EC2 instances within the Spot Fleet
        // So that they can communicate with the EFS.
        // The EFS has this security group "whitelisted" for ingress
        this.spotFleet.addSecurityGroup(props.fileSystemSecurityGroup);

        // Mount the EFS to the EC2 instances within this fleet
        this.spotFleet.addUserData(
            "yum check-update -y",    // Ubuntu: apt-get -y update
            "yum upgrade -y",                                 // Ubuntu: apt-get -y upgrade
            "yum install -y amazon-efs-utils",                // Ubuntu: apt-get -y install amazon-efs-utils
            "yum install -y nfs-utils",                       // Ubuntu: apt-get -y install nfs-common
            "file_system_id_1=" + props.fileSystem.fileSystemId,
            "efs_mount_point_1=/mnt/efs/fs1",
            "mkdir -p \"${efs_mount_point_1}\"",
            "test -f \"/sbin/mount.efs\" && echo \"${file_system_id_1}:/ ${efs_mount_point_1} efs defaults,_netdev\" >> /etc/fstab || " +
            "echo \"${file_system_id_1}.efs." + Stack.of(this).region + ".amazonaws.com:/ ${efs_mount_point_1} nfs4 nfsvers=4.1,rsize=1048576,wsize=1048576,hard,timeo=600,retrans=2,noresvport,_netdev 0 0\" >> /etc/fstab",
            "mount -a -t efs,nfs4 defaults",
            "sudo chmod go+rw /mnt/efs/fs1",
        );
    }
}