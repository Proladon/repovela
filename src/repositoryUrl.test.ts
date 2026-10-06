import { expect, it } from 'vitest';
import { repositoryWebLinks, repositoryWebUrl } from './repositoryUrl';

it.each([
  ['git@github.com:Proladon/repovela.git', 'https://github.com/Proladon/repovela'],
  [
    'ssh://git@gitlab.example.com:2222/group/subgroup/repo.git',
    'https://gitlab.example.com/group/subgroup/repo',
  ],
  ['git://github.com/team/repo.git', 'https://github.com/team/repo'],
  [
    'https://user:password@github.com/team/repo.git?token=secret#fragment',
    'https://github.com/team/repo',
  ],
  ['http://git.example.com:8080/group/repo.git/', 'http://git.example.com:8080/group/repo'],
  [' https://bitbucket.org/team/repo.git ', 'https://bitbucket.org/team/repo'],
  ['https://git.example.com/group/a%20b.git', 'https://git.example.com/group/a%20b'],
])('將遠端 %s 轉成 repo 網站', (remote, expected) => {
  expect(repositoryWebUrl(remote)).toBe(expected);
});

it.each([
  '',
  '/local/repo.git',
  'C:\\repo.git',
  'file:///repo.git',
  'javascript:alert(1)',
  'https://',
  'https://github.com/',
  'https://git\nhub.com/team/repo',
])('不將 %s 當作 repo 網站', (remote) => {
  expect(repositoryWebUrl(remote)).toBeNull();
});

it('略過本機遠端，origin 優先且保留其他遠端', () => {
  expect(
    repositoryWebLinks([
      { name: 'upstream', url: 'git@github.com:team/upstream.git' },
      { name: 'local', url: 'C:/local.git' },
      { name: 'origin', url: 'https://github.com/team/fork.git' },
    ]),
  ).toEqual([
    { name: 'origin', url: 'https://github.com/team/fork' },
    { name: 'upstream', url: 'https://github.com/team/upstream' },
  ]);
});
