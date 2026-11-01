import test from "node:test";
import assert from "node:assert/strict";
import { exposureSignals } from "./findings.mjs";

const instance = { InstanceId: "i-production", State: { Name: "running" }, Tags: [{ Key: "Environment", Value: "production" }], NetworkInterfaces: [{ NetworkInterfaceId: "eni-1", Association: { PublicIp: "203.0.113.10" }, Ipv6Addresses: [{ Ipv6Address: "2001:db8::1" }], Groups: [{ GroupId: "sg-1" }] }] };
const rule = (from, to = from, protocol = "tcp") => ({ IpProtocol: protocol, FromPort: from, ToPort: to, IpRanges: [{ CidrIp: "0.0.0.0/0" }], Ipv6Ranges: [{ CidrIpv6: "::/0" }] });
const scan = (rules, resource = instance) => exposureSignals([resource], [{ GroupId: "sg-1", IpPermissions: rules }]);

test("identifies SSH, RDP, HTTP and HTTPS on non-development EC2 instances", () => {
  const rows = scan([22, 3389, 80, 443].map((port) => rule(port)));
  assert.deepEqual(rows.map((r) => r.servicePorts[0]), [{ port: 22, service: "SSH" }, { port: 3389, service: "RDP" }, { port: 80, service: "HTTP" }, { port: 443, service: "HTTPS" }]);
  assert.ok(rows.every((r) => r.devTagged === false && r.instanceId === "i-production" && r.groupId === "sg-1"));
  assert.deepEqual(rows[0].sources, ["0.0.0.0/0", "::/0"]);
  assert.deepEqual(rows[0].addresses, ["203.0.113.10", "2001:db8::1"]);
});

test("matches encompassing ranges and all-protocol rules without duplicating a rule", () => {
  const [range] = scan([rule(0, 65535, "6")]);
  assert.deepEqual(range.servicePorts.map((r) => r.port), [22, 3389, 80, 443]);
  const [all] = scan([{ IpProtocol: "-1", IpRanges: [{ CidrIp: "0.0.0.0/0" }] }]);
  assert.equal(all.ports, "all");
  assert.equal(all.servicePorts.length, 4);
  assert.deepEqual(scan([rule(23, 79)]), []);
});

test("reports UDP RDP and labels other UDP ports without claiming TCP services", () => {
  assert.deepEqual(scan([rule(3389, 3389, "17")])[0].servicePorts, [{ port: 3389, service: "RDP" }]);
  assert.deepEqual(scan([rule(443, 443, "udp")])[0].servicePorts, [{ port: 443, service: "UDP/443" }]);
  assert.deepEqual(scan([rule(0, 65535, "icmp")]), []);
});

test("excludes CIDR-restricted ingress and matches only the interface address family", () => {
  assert.deepEqual(scan([{ ...rule(22), IpRanges: [{ CidrIp: "10.0.0.0/8" }], Ipv6Ranges: [{ CidrIpv6: "2001:db8::/32" }] }]), []);
  const ipv4 = { ...instance, NetworkInterfaces: [{ ...instance.NetworkInterfaces[0], Ipv6Addresses: [] }] };
  assert.deepEqual(scan([{ ...rule(443), IpRanges: [] }], ipv4), []);
  const ipv6 = { ...instance, NetworkInterfaces: [{ ...instance.NetworkInterfaces[0], Association: undefined }] };
  assert.deepEqual(scan([{ ...rule(443), Ipv6Ranges: [] }], ipv6), []);
  assert.deepEqual(scan([rule(22)], { ...instance, NetworkInterfaces: [{ ...instance.NetworkInterfaces[0], Association: undefined, Ipv6Addresses: [] }] }), []);
});

test("checks secondary public IPv4 associations and keeps interface security groups separate", () => {
  const nic = { ...instance.NetworkInterfaces[0], Association: undefined, Ipv6Addresses: [], PrivateIpAddresses: [{ Association: { PublicIp: "203.0.113.20" } }] };
  const [row] = scan([rule(443)], { ...instance, NetworkInterfaces: [nic] });
  assert.deepEqual(row.addresses, ["203.0.113.20"]);
  assert.equal(exposureSignals([{ ...instance, NetworkInterfaces: [{ ...nic, Groups: [{ GroupId: "sg-private" }], PrivateIpAddresses: [] }, { ...nic, Groups: [{ GroupId: "sg-closed" }] }] }], [{ GroupId: "sg-private", IpPermissions: [rule(443)] }, { GroupId: "sg-closed", IpPermissions: [] }]).length, 0);
});

test("terminated instances are excluded and incomplete public-interface groups fail coverage", () => {
  assert.deepEqual(scan([rule(22)], { ...instance, State: { Name: "terminated" } }), []);
  assert.throws(() => exposureSignals([instance], []), /coverage is incomplete/);
  assert.throws(() => scan([rule(22)], { ...instance, NetworkInterfaces: [{ ...instance.NetworkInterfaces[0], Groups: [] }] }), /unavailable/);
});
